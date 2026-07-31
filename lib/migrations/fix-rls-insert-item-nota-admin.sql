-- ============================================================
-- Bug: admin não conseguia ACRESCENTAR um item numa nota criada por outra
-- pessoa. Ex: NF 000468592 (PADARIA E MERCADINHO TROPIC) foi lançada por
-- um usuário X; ao tentar editar/adicionar um item nela como admin, o
-- Supabase rejeitava com:
--   "new row violates row-level security policy for table financeiro_lancamento_itens"
--
-- Causa: a migration financeiro-lancamentos-insert-qualquer-unidade.sql
-- (destravar CRIAÇÃO de nota nova pra qualquer unidade) reescreveu a policy
-- de INSERT de financeiro_lancamento_itens só com `l.criado_por = auth.uid()`,
-- e sem querer removeu o bypass de admin que a policy anterior tinha
-- (fix-rls-insert-itens-nota-paga.sql já tinha `admin OR unidade = ...`).
-- Resultado: só quem criou a nota podia inserir item nela — nem admin.
--
-- UPDATE/DELETE de item já tinham o bypass de admin (não foram afetados,
-- só o INSERT precisa desse fix).
-- ============================================================

DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR EXISTS (SELECT 1 FROM financeiro_lancamentos l WHERE l.id = lancamento_id AND l.criado_por = auth.uid())
  );

-- Verificação
SELECT policyname, cmd, with_check FROM pg_policies
WHERE tablename = 'financeiro_lancamento_itens' AND policyname = 'financeiro_lancamento_itens_insert';
