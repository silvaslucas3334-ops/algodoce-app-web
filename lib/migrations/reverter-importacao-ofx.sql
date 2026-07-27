-- Permite ao admin desfazer um upload de OFX feito com a loja errada (ex:
-- mis-click no toggle "Loja deste extrato" da aba Conciliar Extrato).
-- Escopado a status_conciliacao='pendente': linhas já conciliadas continuam
-- protegidas (também pela FK financeiro_lancamentos.extrato_transacao_id /
-- financeiro_receitas.extrato_transacao_id, que bloqueariam o DELETE de
-- qualquer forma) e linhas 'ignorado' também ficam de fora de propósito —
-- é uma decisão manual já tomada sobre aquela transação, não um artefato de
-- import errado.
DROP POLICY IF EXISTS financeiro_extrato_transacoes_delete_blocked ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_delete_admin_pendente ON financeiro_extrato_transacoes FOR DELETE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    AND status_conciliacao = 'pendente'
  );

-- Verificação
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'financeiro_extrato_transacoes' ORDER BY cmd;
