-- ============================================================
-- Módulo Financeiro — Cotações (RFQ) + histórico de custo por fornecedor
--
-- A) Cotação futura: cria uma lista de itens + quantidades, convida
--    fornecedores, gera um documento pra enviar a cada um (fora do app),
--    digita manualmente os preços que cada um respondeu, e compara —
--    preço unitário por item E preço total da cotação por fornecedor.
--    Fechamento escolhe UM fornecedor vencedor pra cotação inteira.
-- B) Histórico por fornecedor: view nova espelhando
--    financeiro_custo_medio_mensal, mas agrupando por fornecedor em vez
--    de por mês — os dados já existem em financeiro_lancamento_itens,
--    só faltava essa visão.
-- ============================================================

CREATE TABLE IF NOT EXISTS financeiro_cotacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  -- Só pré-preenche a unidade da nota ao fechar — NÃO é usada para RLS
  -- (diferente de financeiro_lancamentos.unidade, que escopa
  -- financeiro_unidade_do_usuario()). Cotações são admin-only, ponto.
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2', 'rateio')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  fornecedor_vencedor_id UUID REFERENCES financeiro_partes(id),
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  fechado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON financeiro_cotacoes(status);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES financeiro_cotacoes(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  unidade_cotacao TEXT NOT NULL, -- snapshot de unidade_compra no momento da criação
  observacao TEXT,
  UNIQUE (cotacao_id, materia_prima_id) -- evita item duplicado por clique duplo
);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES financeiro_cotacoes(id) ON DELETE CASCADE,
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id),
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'respondido', 'sem_resposta')),
  respondido_em TIMESTAMPTZ,
  UNIQUE (cotacao_id, parte_id)
);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_item_id UUID NOT NULL REFERENCES financeiro_cotacao_itens(id) ON DELETE CASCADE,
  cotacao_fornecedor_id UUID NOT NULL REFERENCES financeiro_cotacao_fornecedores(id) ON DELETE CASCADE,
  valor_unitario NUMERIC CHECK (valor_unitario >= 0),
  valor_total NUMERIC CHECK (valor_total >= 0),
  disponivel BOOLEAN NOT NULL DEFAULT true, -- false = fornecedor respondeu mas não tem esse item
  UNIQUE (cotacao_item_id, cotacao_fornecedor_id),
  CONSTRAINT fcp_disponibilidade_check CHECK (
    (disponivel = false AND valor_unitario IS NULL AND valor_total IS NULL) OR
    (disponivel = true AND valor_unitario IS NOT NULL AND valor_total IS NOT NULL)
  )
);

-- ============================================================
-- View: custo médio por FORNECEDOR (espelha financeiro_custo_medio_mensal,
-- trocando o agrupamento por mês pelo agrupamento por parte_id). Sem
-- LIMIT — cortar linhas antigas de um fornecedor erraria a média
-- silenciosamente, na métrica que a feature existe pra mostrar.
-- ============================================================
DROP VIEW IF EXISTS financeiro_custo_por_fornecedor;
CREATE VIEW financeiro_custo_por_fornecedor
WITH (security_invoker = true) AS
SELECT
  it.materia_prima_id,
  l.parte_id,
  p.nome AS fornecedor_nome,
  SUM(it.quantidade * it.fator_conversao) AS quantidade_convertida,
  SUM(it.valor_total) AS valor_total,
  SUM(it.valor_total) / NULLIF(SUM(it.quantidade * it.fator_conversao), 0) AS custo_medio_por_unidade_medida,
  COUNT(*) AS numero_compras,
  MAX(l.data_lancamento) AS ultima_compra
FROM financeiro_lancamento_itens it
JOIN financeiro_lancamentos l ON l.id = it.lancamento_id
JOIN financeiro_partes p ON p.id = l.parte_id
WHERE l.status <> 'cancelado'
GROUP BY it.materia_prima_id, l.parte_id, p.nome;

-- ============================================================
-- RPC: responde os preços de um fornecedor pra uma cotação inteira numa
-- única transação (upsert em lote + status do fornecedor) — evita estado
-- parcial caso o upsert de N itens falhe no meio (diferente do padrão de
-- "2 UPDATEs sequenciais" já aceito em confirmarConciliacao, que é seguro
-- porque reprocessar dá o mesmo resultado; aqui não é só 2 passos).
-- ============================================================
CREATE OR REPLACE FUNCTION financeiro_cotacao_responder(
  p_cotacao_fornecedor_id UUID,
  p_precos JSONB -- [{cotacao_item_id, valor_unitario, valor_total, disponivel}, ...]
) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode responder cotações';
  END IF;

  INSERT INTO financeiro_cotacao_precos (cotacao_item_id, cotacao_fornecedor_id, valor_unitario, valor_total, disponivel)
  SELECT
    (x->>'cotacao_item_id')::UUID,
    p_cotacao_fornecedor_id,
    (x->>'valor_unitario')::NUMERIC,
    (x->>'valor_total')::NUMERIC,
    (x->>'disponivel')::BOOLEAN
  FROM jsonb_array_elements(p_precos) AS x
  ON CONFLICT (cotacao_item_id, cotacao_fornecedor_id)
  DO UPDATE SET
    valor_unitario = EXCLUDED.valor_unitario,
    valor_total = EXCLUDED.valor_total,
    disponivel = EXCLUDED.disponivel;

  UPDATE financeiro_cotacao_fornecedores
  SET status = 'respondido', respondido_em = now()
  WHERE id = p_cotacao_fornecedor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_cotacao_responder TO authenticated;

-- ============================================================
-- RLS — admin-only nas 4 tabelas (mesmo nível de Extrato/Matérias-Primas
-- write/Partes write): comparação entre fornecedores concorrentes é mais
-- sensível que um lançamento individual. Uma policy por operação, nunca
-- fragmentada por role. DELETE sempre bloqueado — cancelamento é por
-- status='cancelada', nunca exclusão física.
-- ============================================================
ALTER TABLE financeiro_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_precos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_cotacoes_select ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_select ON financeiro_cotacoes FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacoes_insert ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_insert ON financeiro_cotacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_cotacoes_update ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_update ON financeiro_cotacoes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacoes_delete_blocked ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_delete_blocked ON financeiro_cotacoes FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_itens_select ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_select ON financeiro_cotacao_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_insert ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_insert ON financeiro_cotacao_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_update ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_update ON financeiro_cotacao_itens FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_precos_select ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_select ON financeiro_cotacao_precos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_insert ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_insert ON financeiro_cotacao_precos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_update ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_update ON financeiro_cotacao_precos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_delete_blocked ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_delete_blocked ON financeiro_cotacao_precos FOR DELETE USING (false);

-- Verificação
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('financeiro_cotacoes', 'financeiro_cotacao_itens', 'financeiro_cotacao_fornecedores', 'financeiro_cotacao_precos');
