-- Reestruturação do Financeiro: tabela ÚNICA de lançamentos (fase 1.5)
-- Os dois formulários (Despesa manual e Nota de insumos) passam a abastecer
-- financeiro_lancamentos; a nota gera automaticamente a sua "despesa" (lado
-- pagamento) e os itens dela vão para financeiro_lancamento_itens (lado CMV).
-- As tabelas financeiro_despesas/financeiro_compras_insumos são DERRUBADAS
-- (continham só dados de teste — aprovado pelo usuário em 08/07/2026).
-- Cadastros (partes, matérias-primas, contas) são preservados.
-- Execute no Supabase SQL Editor.

-- ============================================================
-- 1. Extrato: remover vínculos com as tabelas antigas
-- ============================================================
ALTER TABLE financeiro_extrato_transacoes DROP CONSTRAINT IF EXISTS fet_um_match_so;
ALTER TABLE financeiro_extrato_transacoes
  DROP COLUMN IF EXISTS tipo_match,
  DROP COLUMN IF EXISTS compra_insumo_id,
  DROP COLUMN IF EXISTS despesa_id;

-- ============================================================
-- 2. Derrubar as tabelas de lançamento antigas (só teste)
--    A view antiga depende de financeiro_compras_insumos — precisa cair
--    primeiro (ela é recriada em §8, sobre a estrutura nova).
-- ============================================================
DROP VIEW IF EXISTS financeiro_custo_medio_mensal;
DROP TABLE IF EXISTS financeiro_compras_insumos;
DROP TABLE IF EXISTS financeiro_despesas;

-- ============================================================
-- 3. Partes: documento obrigatório + dados de pagamento padrão
--    (pré-preenchem o lançamento; editáveis lá)
-- ============================================================
ALTER TABLE financeiro_partes
  ADD COLUMN IF NOT EXISTS forma_pagamento_padrao TEXT CHECK (forma_pagamento_padrao IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT NOT NULL DEFAULT 'a_vista' CHECK (condicao_pagamento IN ('a_vista', 'a_prazo')),
  ADD COLUMN IF NOT EXISTS prazo_dias INT CHECK (prazo_dias IN (7, 15, 30));

-- Documento (CPF/CNPJ) vira obrigatório: é a chave do match com o extrato.
DELETE FROM financeiro_partes WHERE documento IS NULL; -- só cadastros de teste
ALTER TABLE financeiro_partes ALTER COLUMN documento SET NOT NULL;

-- ============================================================
-- 4. financeiro_recorrencias (despesas fixas mensais: aluguel, internet...)
--    Criada antes de lancamentos por causa da FK recorrencia_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_recorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  dia_vencimento INT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28), -- até 28 p/ existir em todo mês
  forma_pagamento TEXT CHECK (forma_pagamento IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  unidade TEXT NOT NULL CHECK (unidade IN ('cozinha', 'loja1', 'loja2', 'rateio')),
  conta_id UUID NOT NULL REFERENCES financeiro_contas(id),
  ativa BOOLEAN NOT NULL DEFAULT true,
  proxima_data DATE NOT NULL,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. financeiro_lancamentos — a tabela ÚNICA
--    tipo='despesa'        → lançamento manual (salário, aluguel, recibo)
--    tipo='compra_insumos' → gerado pelo formulário de Nota (itens em §6)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'compra_insumos')),
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL CHECK (valor_total > 0),
  numero_documento TEXT, -- nº NF ou recibo
  data_lancamento DATE NOT NULL,  -- data da compra/competência
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  condicao_pagamento TEXT CHECK (condicao_pagamento IN ('a_vista', 'a_prazo')),
  parcela_num INT,
  parcela_total INT,
  grupo_parcelamento UUID, -- mesmo uuid liga as N parcelas irmãs; null quando 1x
  recorrencia_id UUID REFERENCES financeiro_recorrencias(id),
  unidade TEXT NOT NULL CHECK (unidade IN ('cozinha', 'loja1', 'loja2', 'rateio')),
  conta_id UUID REFERENCES financeiro_contas(id),
  extrato_transacao_id UUID REFERENCES financeiro_extrato_transacoes(id),
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Conta contábil obrigatória na despesa manual (alimenta DRE/fluxo de caixa);
  -- na nota a conta é por ITEM (herdada do cadastro da matéria-prima).
  CONSTRAINT fl_conta_obrigatoria_despesa CHECK (tipo = 'compra_insumos' OR conta_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_fl_status ON financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fl_vencimento ON financeiro_lancamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_fl_parte ON financeiro_lancamentos(parte_id);
CREATE INDEX IF NOT EXISTS idx_fl_unidade ON financeiro_lancamentos(unidade);
CREATE INDEX IF NOT EXISTS idx_fl_grupo_parcelamento ON financeiro_lancamentos(grupo_parcelamento) WHERE grupo_parcelamento IS NOT NULL;

-- ============================================================
-- 6. financeiro_lancamento_itens — itens da nota (alimenta o CMV)
--    quantidade fica na unidade DA NOTA; fator_conversao converte para a
--    unidade_medida da ficha técnica (pré-preenchido do cadastro quando a
--    unidade da nota = unidade_compra cadastrada; senão o usuário informa).
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_lancamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES financeiro_lancamentos(id) ON DELETE RESTRICT,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0), -- na unidade_nota
  unidade_nota TEXT NOT NULL, -- unidade impressa na NF (pode diferir da unidade_compra do cadastro)
  fator_conversao NUMERIC NOT NULL CHECK (fator_conversao > 0), -- unidade_medida por 1 unidade_nota
  valor_unitario NUMERIC NOT NULL CHECK (valor_unitario >= 0),
  valor_total NUMERIC NOT NULL CHECK (valor_total >= 0),
  conta_id UUID REFERENCES financeiro_contas(id), -- herdada do cadastro da matéria-prima
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fli_lancamento ON financeiro_lancamento_itens(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_fli_materia_prima ON financeiro_lancamento_itens(materia_prima_id);

-- ============================================================
-- 7. Extrato: vínculo novo com a tabela única
-- ============================================================
ALTER TABLE financeiro_extrato_transacoes
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES financeiro_lancamentos(id);

-- ============================================================
-- 8. View de custo médio mensal (REBUILD sobre a estrutura nova)
--    Normaliza tudo para a unidade_medida via fator_conversao POR LINHA —
--    notas em unidades diferentes (kg numa, caixa noutra) somam certo.
--    DROP antes porque as colunas mudaram (CREATE OR REPLACE não remove coluna).
-- ============================================================
DROP VIEW IF EXISTS financeiro_custo_medio_mensal;
CREATE VIEW financeiro_custo_medio_mensal
WITH (security_invoker = true) AS
SELECT
  it.materia_prima_id,
  date_trunc('month', l.data_lancamento)::date AS mes_referencia,
  mp.nome AS materia_prima_nome,
  mp.unidade_medida,
  SUM(it.quantidade * it.fator_conversao) AS quantidade_convertida, -- em unidade_medida
  SUM(it.valor_total) AS valor_total,
  SUM(it.valor_total) / NULLIF(SUM(it.quantidade * it.fator_conversao), 0) AS custo_medio_por_unidade_medida,
  COUNT(*) AS numero_compras
FROM financeiro_lancamento_itens it
JOIN financeiro_lancamentos l ON l.id = it.lancamento_id
JOIN financeiro_materias_primas mp ON mp.id = it.materia_prima_id
WHERE l.status <> 'cancelado'
GROUP BY it.materia_prima_id, date_trunc('month', l.data_lancamento), mp.nome, mp.unidade_medida;

-- ============================================================
-- 9. RLS das tabelas novas (mesmo padrão da fase 1)
-- ============================================================
ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_lancamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_recorrencias ENABLE ROW LEVEL SECURITY;

-- lancamentos: admin tudo; loja/cozinha só a própria unidade, edição só em aberto.
DROP POLICY IF EXISTS financeiro_lancamentos_select ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_select ON financeiro_lancamentos FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR unidade = financeiro_unidade_do_usuario()
  );
DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR unidade = financeiro_unidade_do_usuario()
    )
  );
DROP POLICY IF EXISTS financeiro_lancamentos_update ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_update ON financeiro_lancamentos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  );
DROP POLICY IF EXISTS financeiro_lancamentos_delete_blocked ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_delete_blocked ON financeiro_lancamentos FOR DELETE USING (false);

-- itens: acesso segue o lançamento pai.
DROP POLICY IF EXISTS financeiro_lancamento_itens_select ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_select ON financeiro_lancamento_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR l.unidade = financeiro_unidade_do_usuario()
        )
    )
  );
DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.unidade = financeiro_unidade_do_usuario() AND l.status = 'aberto')
        )
    )
  );
DROP POLICY IF EXISTS financeiro_lancamento_itens_update ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_update ON financeiro_lancamento_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.unidade = financeiro_unidade_do_usuario() AND l.status = 'aberto')
        )
    )
  );
DROP POLICY IF EXISTS financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens FOR DELETE USING (false);

-- recorrencias: só admin (despesas fixas são geridas pelo gestor).
DROP POLICY IF EXISTS financeiro_recorrencias_select ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_select ON financeiro_recorrencias FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_insert ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_insert ON financeiro_recorrencias FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_update ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_update ON financeiro_recorrencias FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_delete_blocked ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_delete_blocked ON financeiro_recorrencias FOR DELETE USING (false);

-- ============================================================
-- 10. Geração automática das despesas recorrentes (pg_cron, mesmo
--     precedente de gerar_tarefas_recorrentes: roda de madrugada em SP)
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_lancamentos_recorrentes() RETURNS void AS $$
DECLARE
  rec RECORD;
  hoje_sp DATE;
BEGIN
  hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  FOR rec IN
    SELECT * FROM financeiro_recorrencias WHERE ativa AND proxima_data <= hoje_sp
  LOOP
    INSERT INTO financeiro_lancamentos (
      tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento,
      status, forma_pagamento, condicao_pagamento, unidade, conta_id,
      recorrencia_id, criado_por
    ) VALUES (
      'despesa', rec.parte_id, rec.descricao, rec.valor, rec.proxima_data, rec.proxima_data,
      'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id,
      rec.id, rec.criado_por
    );

    UPDATE financeiro_recorrencias
    SET proxima_data = (date_trunc('month', rec.proxima_data) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date,
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilita a extensão pg_cron se ainda não estiver ativa neste projeto.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 03:15 UTC = 00:15 em São Paulo (10 min depois do job de tarefas).
-- unschedule antes torna o script re-executável sem erro de job duplicado.
DO $$ BEGIN
  PERFORM cron.unschedule('gerar-lancamentos-recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('gerar-lancamentos-recorrentes', '15 3 * * *', 'SELECT gerar_lancamentos_recorrentes()');

-- ============================================================
-- Verificação
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename LIKE 'financeiro_%'
ORDER BY tablename;
