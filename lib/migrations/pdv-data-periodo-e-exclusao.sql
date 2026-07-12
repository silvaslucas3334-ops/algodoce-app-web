-- Período do relatório passa a ser baseado na DATA DE FECHAMENTO do pedido
-- (é a data de emissão da NF), não na data de abertura. Nem todo pedido no
-- arquivo "Finalizados" já fechou (status 'Em Andamento'/'Solicitou
-- Fechamento' têm data_fechamento NULL) — por isso o fallback pra
-- data_abertura. Centralizado numa coluna gerada pra não duplicar essa regra
-- em cada query/function (report, hub, contagem de existentes, delete).
-- Execute no Supabase SQL Editor.

-- ============================================================
-- 1. Coluna gerada data_periodo
-- ============================================================
-- AT TIME ZONE INTERVAL '-03:00' (não o nome de zona 'America/Sao_Paulo'):
-- colunas geradas exigem expressão IMMUTABLE, e só a variante com offset fixo
-- é IMMUTABLE (a variante com nome de zona é STABLE, depende do tzdata do
-- sistema). Sem isso, um pedido fechado à noite em SP (ex. 23h, que já é
-- madrugada em UTC) cairia no dia seguinte, já que a sessão do Postgres no
-- Supabase roda em UTC e um "::date" direto trunca por UTC, não por SP.
ALTER TABLE financeiro_pdv_pedidos ADD COLUMN IF NOT EXISTS data_periodo DATE GENERATED ALWAYS AS (
  (COALESCE(data_fechamento, data_abertura) AT TIME ZONE INTERVAL '-03:00')::date
) STORED;

CREATE INDEX IF NOT EXISTS idx_fpp_unidade_periodo ON financeiro_pdv_pedidos(unidade, data_periodo);

-- ============================================================
-- 2. financeiro_pdv_substituir_periodo — DELETE agora por data_periodo,
--    com um segundo critério de segurança: também remove pelo código do
--    pedido presente no lote sendo importado. Necessário porque um pedido
--    "Em Andamento" importado num mês (data_periodo = mês de abertura, via
--    fallback) pode fechar depois e mudar de data_periodo na reimportação
--    seguinte — sem esse segundo critério, a linha antiga (no mês velho)
--    não seria removida e o INSERT do "novo" colidiria no índice único
--    (unidade, codigo).
-- ============================================================
CREATE OR REPLACE FUNCTION financeiro_pdv_substituir_periodo(
  p_unidade TEXT,
  p_data_min DATE,
  p_data_max DATE,
  p_pedidos JSONB,
  p_itens JSONB,
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
    AND (
      data_periodo BETWEEN p_data_min AND p_data_max
      OR codigo IN (SELECT codigo FROM jsonb_to_recordset(p_pedidos) AS x(codigo TEXT))
    );
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

-- ============================================================
-- 3. financeiro_pdv_excluir_periodo — exclui um período inteiro (sem
--    reinserir). Viabiliza reteste do fluxo de importação do zero.
-- ============================================================
CREATE OR REPLACE FUNCTION financeiro_pdv_excluir_periodo(
  p_unidade TEXT,
  p_data_min DATE,
  p_data_max DATE
) RETURNS JSONB AS $$
DECLARE
  v_removidos INT;
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode excluir períodos do PDV';
  END IF;

  DELETE FROM financeiro_pdv_pedidos
  WHERE unidade = p_unidade
    AND data_periodo BETWEEN p_data_min AND p_data_max;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('pedidos_removidos', v_removidos);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_pdv_excluir_periodo TO authenticated;

-- ============================================================
-- Verificação
-- ============================================================
SELECT unidade, data_abertura, data_fechamento, data_periodo
FROM financeiro_pdv_pedidos
ORDER BY importado_em DESC
LIMIT 5;
