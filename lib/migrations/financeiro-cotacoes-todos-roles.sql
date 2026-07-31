-- Cotações deixa de ser admin-only — lojas/cozinha criam a cotação e
-- registram os preços dos fornecedores, o admin centraliza e formaliza o
-- pedido a partir do resultado. Diferente da Ficha Técnica (que tem um
-- fluxo de aprovação de dois passos), aqui é colaborativo direto: qualquer
-- um cria/edita, sem "pendente de revisão" — o ciclo de vida já existente
-- (aberta/fechada/cancelada) é suficiente.
-- Execute no Supabase SQL Editor.

DROP POLICY IF EXISTS financeiro_cotacoes_select ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_select ON financeiro_cotacoes FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacoes_insert ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_insert ON financeiro_cotacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha') AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_cotacoes_update ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_update ON financeiro_cotacoes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));

DROP POLICY IF EXISTS financeiro_cotacao_itens_select ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_select ON financeiro_cotacao_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_itens_insert ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_insert ON financeiro_cotacao_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_itens_update ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_update ON financeiro_cotacao_itens FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));

DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));

DROP POLICY IF EXISTS financeiro_cotacao_precos_select ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_select ON financeiro_cotacao_precos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_precos_insert ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_insert ON financeiro_cotacao_precos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_precos_update ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_update ON financeiro_cotacao_precos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));

-- RPC de resposta de cotação (ResponderCotacaoModal) — mesma liberação.
CREATE OR REPLACE FUNCTION financeiro_cotacao_responder(
  p_cotacao_fornecedor_id UUID,
  p_precos JSONB
) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) NOT IN ('admin', 'loja', 'cozinha') THEN
    RAISE EXCEPTION 'apenas usuário autenticado do sistema pode responder cotações';
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

-- Verificação
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename LIKE 'financeiro_cotacao%' ORDER BY tablename, cmd;
