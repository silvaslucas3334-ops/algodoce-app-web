-- Destrava a CRIAÇÃO de lançamento (despesa/nota de insumo) pra qualquer
-- unidade, pra qualquer role autenticado — várias pessoas de unidades
-- diferentes lançam despesa/nota, e hoje loja/cozinha só conseguiam criar
-- pra própria unidade (financeiro_unidade_do_usuario()). A EDIÇÃO
-- continua travada por unidade (financeiro_lancamentos_update inalterada
-- — só admin edita lançamento de unidade que não é a sua). Continua
-- exigindo criado_por = auth.uid(), ninguém lança em nome de outro usuário.
-- Execute no Supabase SQL Editor.

DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());

-- Itens herdam a mesma liberação (inseridos no mesmo fluxo atômico de
-- criar a nota) — mantém a checagem de criado_por do lançamento pai, só
-- remove a exigência de unidade.
DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM financeiro_lancamentos l WHERE l.id = lancamento_id AND l.criado_por = auth.uid())
  );

-- Verificação
SELECT policyname, cmd FROM pg_policies WHERE tablename IN ('financeiro_lancamentos', 'financeiro_lancamento_itens') ORDER BY tablename, cmd;
