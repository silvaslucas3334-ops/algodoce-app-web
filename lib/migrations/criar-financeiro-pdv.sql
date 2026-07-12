-- Import do PDV: pedidos e itens importados dos exports do sistema de PDV
-- (Histórico de Itens Vendidos + Finalizados), por loja e por período.
-- Substitui o VLOOKUP manual em Excel que gera a aba "Itens Vendidos"
-- enviada à contadora. Normalizado: ajustes de pedido (entrega, desconto,
-- serviço, NF) ficam só em financeiro_pdv_pedidos; o "achatamento" que
-- replica a planilha manual (ajuste só na 1ª linha de item do pedido)
-- acontece em tempo de consulta (lib/pdv-report.ts), nunca persistido.
-- Execute no Supabase SQL Editor.

-- ============================================================
-- 1. financeiro_pdv_pedidos — um registro por pedido do PDV
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_pdv_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2')),
  codigo TEXT NOT NULL, -- "Código" do Finalizados = "Cod. Ped." do Histórico
  data_abertura TIMESTAMPTZ NOT NULL,
  data_fechamento TIMESTAMPTZ,
  -- Vocabulário de um PDV de terceiros: SEM CHECK aqui (foge do padrão do
  -- módulo de propósito) para não quebrar a importação se o fornecedor
  -- introduzir um status novo. Os valores conhecidos são validados em
  -- lib/pdv-import.ts, onde dá pra ajustar sem precisar de migration.
  status TEXT NOT NULL,
  tot_itens NUMERIC, -- é o valor (subtotal dos itens antes de ajustes), não uma contagem — nome do PDV engana
  servico NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  valor_entrega NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  total_recebido NUMERIC,
  forma_pagamento TEXT, -- texto livre do PDV — vocabulário próprio, não é o
                         -- mesmo enum FormaPagamento (boleto/pix/...) do resto do app
  nota_emitida BOOLEAN,
  serie_nf TEXT,
  numero_nf TEXT,
  importado_por UUID NOT NULL REFERENCES usuarios(id),
  importado_em TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpp_dedupe ON financeiro_pdv_pedidos(unidade, codigo);
CREATE INDEX IF NOT EXISTS idx_fpp_unidade_data ON financeiro_pdv_pedidos(unidade, data_abertura);
CREATE INDEX IF NOT EXISTS idx_fpp_status ON financeiro_pdv_pedidos(status);

-- ============================================================
-- 2. financeiro_pdv_itens — um registro por linha de item vendido
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_pdv_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES financeiro_pdv_pedidos(id) ON DELETE CASCADE,
  -- posição da linha no pedido, na ordem do arquivo de origem. É o que
  -- garante reconstituir com certeza "a 1ª linha do pedido" no relatório
  -- achatado — data_hora_item sozinho não serve, itens do mesmo pedido
  -- costumam empatar no mesmo instante.
  ordem_pedido INT NOT NULL,
  data_hora_item TIMESTAMPTZ NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  valor_total_item NUMERIC NOT NULL DEFAULT 0,
  -- Vocabulário do PDV (Produto/Complemento/Item de combo/...), sem CHECK
  -- pelo mesmo motivo do status do pedido — validado em lib/pdv-import.ts.
  tipo_item TEXT NOT NULL,
  nome_produto TEXT NOT NULL,
  tipo_produto TEXT,
  categoria_produto TEXT,
  -- Reservado p/ FUTURA fase de CMV/ficha técnica. O export atual (Histórico
  -- de Itens Vendidos) NÃO tem coluna de código de produto — fica NULL até
  -- o PDV passar a exportar isso ou a fase de CMV mapear por nome.
  codigo_produto_pdv TEXT,
  importado_em TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fpi_pedido ON financeiro_pdv_itens(pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpi_ordem ON financeiro_pdv_itens(pedido_id, ordem_pedido);

-- ============================================================
-- 3. RLS — leitura admin-only; TODA escrita (delete+insert) só pela
--    function §4. Sem policy de INSERT/UPDATE direta: um único caminho de
--    escrita, auditável, que respeita a semântica de "substituir período"
--    — nenhuma tela pode inserir um pedido avulso por fora da regra.
-- ============================================================
ALTER TABLE financeiro_pdv_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_pdv_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_pdv_pedidos_select ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_select ON financeiro_pdv_pedidos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pdv_pedidos_insert_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_insert_blocked ON financeiro_pdv_pedidos FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS financeiro_pdv_pedidos_update_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_update_blocked ON financeiro_pdv_pedidos FOR UPDATE USING (false);
DROP POLICY IF EXISTS financeiro_pdv_pedidos_delete_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_delete_blocked ON financeiro_pdv_pedidos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_pdv_itens_select ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_select ON financeiro_pdv_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pdv_itens_insert_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_insert_blocked ON financeiro_pdv_itens FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS financeiro_pdv_itens_update_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_update_blocked ON financeiro_pdv_itens FOR UPDATE USING (false);
DROP POLICY IF EXISTS financeiro_pdv_itens_delete_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_delete_blocked ON financeiro_pdv_itens FOR DELETE USING (false);

-- ============================================================
-- 4. financeiro_pdv_substituir_periodo — a ÚNICA forma de escrever aqui.
--    SECURITY DEFINER (roda como dono da function, não como o chamador,
--    porque a RLS acima bloqueia tudo) + checagem de admin no corpo.
--    Um único bloco de function = uma transação: se o INSERT falhar no
--    meio, o DELETE desfaz também — nunca fica período pela metade.
-- ============================================================
CREATE OR REPLACE FUNCTION financeiro_pdv_substituir_periodo(
  p_unidade TEXT,
  p_data_min DATE,
  p_data_max DATE,
  p_pedidos JSONB, -- [{codigo, data_abertura, data_fechamento, status, tot_itens,
                    --   servico, desconto, valor_entrega, total, total_recebido,
                    --   forma_pagamento, nota_emitida, serie_nf, numero_nf}]
  p_itens JSONB,   -- [{cod_ped, ordem_pedido, data_hora_item, quantidade,
                    --   valor_unitario, valor_total_item, tipo_item, nome_produto,
                    --   tipo_produto, categoria_produto, codigo_produto_pdv}]
  p_importado_por UUID
) RETURNS JSONB AS $$
DECLARE
  v_removidos INT;
  v_ins_pedidos INT;
  v_ins_itens INT;
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode importar/substituir períodos do PDV';
  END IF;

  DELETE FROM financeiro_pdv_pedidos
  WHERE unidade = p_unidade
    AND data_abertura::date BETWEEN p_data_min AND p_data_max;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  WITH ins_pedidos AS (
    INSERT INTO financeiro_pdv_pedidos (
      unidade, codigo, data_abertura, data_fechamento, status, tot_itens,
      servico, desconto, valor_entrega, total, total_recebido, forma_pagamento,
      nota_emitida, serie_nf, numero_nf, importado_por
    )
    SELECT p_unidade, x.codigo, x.data_abertura, x.data_fechamento, x.status, x.tot_itens,
           x.servico, x.desconto, x.valor_entrega, x.total, x.total_recebido, x.forma_pagamento,
           x.nota_emitida, x.serie_nf, x.numero_nf, p_importado_por
    FROM jsonb_to_recordset(p_pedidos) AS x(
      codigo TEXT, data_abertura TIMESTAMPTZ, data_fechamento TIMESTAMPTZ, status TEXT,
      tot_itens NUMERIC, servico NUMERIC, desconto NUMERIC, valor_entrega NUMERIC, total NUMERIC,
      total_recebido NUMERIC, forma_pagamento TEXT, nota_emitida BOOLEAN, serie_nf TEXT, numero_nf TEXT
    )
    RETURNING id, codigo
  ),
  ins_itens AS (
    INSERT INTO financeiro_pdv_itens (
      pedido_id, ordem_pedido, data_hora_item, quantidade, valor_unitario,
      valor_total_item, tipo_item, nome_produto, tipo_produto, categoria_produto, codigo_produto_pdv
    )
    SELECT ip.id, y.ordem_pedido, y.data_hora_item, y.quantidade, y.valor_unitario,
           y.valor_total_item, y.tipo_item, y.nome_produto, y.tipo_produto, y.categoria_produto, y.codigo_produto_pdv
    FROM jsonb_to_recordset(p_itens) AS y(
      cod_ped TEXT, ordem_pedido INT, data_hora_item TIMESTAMPTZ, quantidade NUMERIC,
      valor_unitario NUMERIC, valor_total_item NUMERIC, tipo_item TEXT, nome_produto TEXT,
      tipo_produto TEXT, categoria_produto TEXT, codigo_produto_pdv TEXT
    )
    JOIN ins_pedidos ip ON ip.codigo = y.cod_ped
    RETURNING id
  )
  SELECT (SELECT count(*) FROM ins_pedidos), (SELECT count(*) FROM ins_itens)
  INTO v_ins_pedidos, v_ins_itens;

  RETURN jsonb_build_object(
    'pedidos_removidos', v_removidos,
    'pedidos_inseridos', v_ins_pedidos,
    'itens_inseridos', v_ins_itens
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_pdv_substituir_periodo TO authenticated;

-- ============================================================
-- Verificação
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_pdv_%';
