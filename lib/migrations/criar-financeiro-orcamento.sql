-- ============================================================
-- Módulo Financeiro — Orçamento do mês (meta de venda + saldo inicial +
-- previsão manual de despesas), base da visão mensal em calendário do
-- Fluxo de Caixa.
--
-- Um registro por (ano, mes, unidade). Meta de venda e saldo inicial só
-- fazem sentido pra loja1/loja2 (rateio não vende nem tem conta bancária
-- própria) — CHECK trava isso.
--
-- Linhas manuais do orçamento de despesas (financeiro_orcamento_itens)
-- não têm policy de INSERT/UPDATE/DELETE — é um rascunho editável o mês
-- inteiro (ao contrário de nota fiscal/cotação, que são registros
-- congelados), mas DELETE é bloqueado em toda tabela deste schema por
-- design. Resolvido do mesmo jeito que financeiro_pre_preparo_itens: uma
-- função SECURITY DEFINER que substitui o conjunto inteiro de linhas.
-- ============================================================

CREATE TABLE IF NOT EXISTS financeiro_orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1','loja2','rateio')),
  valor_meta_venda NUMERIC CHECK (valor_meta_venda IS NULL OR valor_meta_venda > 0),
  saldo_inicial NUMERIC, -- saldo bancário no início do mês; null = "não informado", nunca 0 por omissão
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ano, mes, unidade),
  CONSTRAINT fo_meta_e_saldo_so_loja CHECK (unidade <> 'rateio' OR (valor_meta_venda IS NULL AND saldo_inicial IS NULL))
);

CREATE TABLE IF NOT EXISTS financeiro_orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES financeiro_orcamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa','compra_insumos')),
  parte_id UUID REFERENCES financeiro_partes(id), -- fornecedor, custo variável
  conta_id UUID REFERENCES financeiro_contas(id), -- categoria, custo fixo
  valor_previsto NUMERIC NOT NULL CHECK (valor_previsto > 0),
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT foi_eixo_por_tipo CHECK (
    (tipo = 'despesa' AND conta_id IS NOT NULL) OR
    (tipo = 'compra_insumos' AND parte_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_foi_orcamento ON financeiro_orcamento_itens(orcamento_id);

ALTER TABLE financeiro_orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_orcamento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_orcamentos_select ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_select ON financeiro_orcamentos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_orcamentos_insert ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_insert ON financeiro_orcamentos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_orcamentos_update ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_update ON financeiro_orcamentos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_orcamentos_delete_blocked ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_delete_blocked ON financeiro_orcamentos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_orcamento_itens_select ON financeiro_orcamento_itens;
CREATE POLICY financeiro_orcamento_itens_select ON financeiro_orcamento_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

CREATE OR REPLACE FUNCTION financeiro_orcamento_salvar_itens(p_orcamento_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar orçamento';
  END IF;
  DELETE FROM financeiro_orcamento_itens WHERE orcamento_id = p_orcamento_id;
  INSERT INTO financeiro_orcamento_itens (orcamento_id, tipo, parte_id, conta_id, valor_previsto, observacao)
  SELECT p_orcamento_id, i->>'tipo', (i->>'parte_id')::UUID, (i->>'conta_id')::UUID, (i->>'valor_previsto')::NUMERIC, i->>'observacao'
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_orcamento_salvar_itens TO authenticated;

-- Verificação
SELECT table_name FROM information_schema.tables WHERE table_name IN ('financeiro_orcamentos', 'financeiro_orcamento_itens');
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'financeiro_orcamento_salvar_itens';
