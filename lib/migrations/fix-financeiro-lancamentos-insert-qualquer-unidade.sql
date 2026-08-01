-- ============================================================
-- Bug: usuário de loja tentando lançar despesa/nota pra uma unidade
-- diferente da própria (ex: Rateio/Cozinha) recebia:
--   "new row violates row-level security policy for table financeiro_lancamentos"
--
-- A trava de unidade na CRIAÇÃO já devia ter sido removida pela migration
-- financeiro-lancamentos-insert-qualquer-unidade.sql (rodada antes, junto
-- com a liberação da unidade no formulário) — o client já manda
-- criado_por = auth.uid() corretamente. Se esse erro ainda acontece, a
-- policy no banco nunca foi atualizada de verdade (ficou só no client).
--
-- Este script reafirma a policy — idempotente, seguro rodar de novo
-- mesmo se já estiver certa. Só toca financeiro_lancamentos_insert (não
-- mexe em financeiro_lancamento_itens_insert, que já tem o bypass de
-- admin de uma correção mais recente).
-- ============================================================

-- Diagnóstico — mostra a policy atual antes de qualquer mudança.
SELECT policyname, cmd, with_check FROM pg_policies
WHERE tablename = 'financeiro_lancamentos' AND policyname = 'financeiro_lancamentos_insert';

DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());

-- Verificação — with_check deve mostrar só "criado_por = auth.uid()",
-- sem nenhuma condição de unidade.
SELECT policyname, cmd, with_check FROM pg_policies
WHERE tablename = 'financeiro_lancamentos' AND policyname = 'financeiro_lancamentos_insert';
