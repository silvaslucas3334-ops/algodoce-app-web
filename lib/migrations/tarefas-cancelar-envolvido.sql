-- Envolvido também pode cancelar a tarefa (não só admin/criador) — mesma
-- trava já usada pro criador: só enquanto 'pendente' e sem evidência
-- enviada. Escopo deliberadamente estreito (só a transição pendente→
-- cancelada), diferente de tarefas_update_criador que também libera
-- edição de campo — envolvido não pode editar a tarefa, só cancelá-la.
-- Reaproveita tarefa_sem_evidencia(), já criada em tarefas-policies-criador.sql.
-- Idempotente — seguro rodar mesmo que já exista em produção.
-- Execute no Supabase SQL Editor.

DROP POLICY IF EXISTS tarefas_update_envolvido_cancelar ON tarefas;
CREATE POLICY tarefas_update_envolvido_cancelar ON tarefas FOR UPDATE
USING (
  status = 'pendente'
  AND tarefa_sem_evidencia(id)
  AND EXISTS (SELECT 1 FROM tarefas_envolvidos WHERE tarefa_id = tarefas.id AND usuario_id = auth.uid())
)
WITH CHECK (
  status = 'cancelada'
  AND EXISTS (SELECT 1 FROM tarefas_envolvidos WHERE tarefa_id = tarefas.id AND usuario_id = auth.uid())
);

-- Verificação
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tarefas' ORDER BY policyname;
