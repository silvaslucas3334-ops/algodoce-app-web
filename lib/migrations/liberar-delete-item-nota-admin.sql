-- ============================================================
-- Só o ITEM de uma nota pode ser removido (admin), pra corrigir erro sem
-- refazer a nota inteira (ex: item duplicado, item errado). O cabeçalho
-- (financeiro_lancamentos) continua sem DELETE — "Cancelar" é a única
-- forma de zerar um lançamento inteiro, mantido de propósito (mesmo
-- princípio de nunca apagar registro financeiro que já vale pro resto do
-- sistema, só ele nunca teve itens próprios que pudessem ficar errados).
-- ============================================================

DROP POLICY IF EXISTS financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_delete_admin ON financeiro_lancamento_itens FOR DELETE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

-- Verificação
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'financeiro_lancamento_itens' ORDER BY cmd;
