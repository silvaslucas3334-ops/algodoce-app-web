-- ============================================================
-- Generaliza tarefas_notificacoes: além de "concluída pelo gestor", agora
-- também dispara em comentário, devolução pra refazer e aprovação — vira
-- um feed de atividade em tempo real (Realtime), não só um aviso
-- assíncrono lido na próxima abertura do app.
--
-- Sem mudança de coluna: `tipo` já era TEXT livre, sem CHECK constraint
-- (ver lib/migrations/add-conclusao-gestor.sql) — os novos valores
-- ('comentario', 'feedback_refazer', 'aprovada') não exigem migração de
-- schema, só a policy de INSERT abaixo (hoje só admin podia inserir).
-- ============================================================

DROP POLICY IF EXISTS notificacoes_insert_admin ON tarefas_notificacoes;
CREATE POLICY notificacoes_insert_qualquer ON tarefas_notificacoes
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR tarefa_id IN (
    SELECT id FROM tarefas
    WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
  )
);

-- Índice pro feed ordenado por data (o índice existente só cobre não-lidas)
CREATE INDEX IF NOT EXISTS idx_tarefas_notificacoes_usuario_created
  ON tarefas_notificacoes(usuario_id, created_at DESC);

-- Verificação
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'tarefas_notificacoes' ORDER BY cmd;
SELECT indexname FROM pg_indexes WHERE tablename = 'tarefas_notificacoes';
