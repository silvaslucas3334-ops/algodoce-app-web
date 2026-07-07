-- 1. Libera criação de recorrência para qualquer usuário do próprio setor
--    (antes só admin podia, mesmo que a UI liberasse)
-- Execute no Supabase SQL Editor

DROP POLICY IF EXISTS recorrencias_insert_admin ON tarefas_recorrencias;
CREATE POLICY recorrencias_insert_qualquer ON tarefas_recorrencias
FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
);

DROP POLICY IF EXISTS recorrencias_update_admin ON tarefas_recorrencias;
CREATE POLICY recorrencias_update_qualquer ON tarefas_recorrencias
FOR UPDATE
USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
)
WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
);

-- 2. Notificação assíncrona: quando o gestor conclui uma tarefa atrasada em nome
--    do colaborador, este vê um aviso na próxima vez que abrir o app (não em tempo real)
CREATE TABLE IF NOT EXISTS tarefas_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL DEFAULT 'concluida_por_gestor',
  mensagem TEXT,
  criado_por TEXT,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefas_notificacoes_usuario_nao_lida
  ON tarefas_notificacoes(usuario_id) WHERE lida_em IS NULL;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tarefas_notificacoes' ORDER BY ordinal_position;
SELECT policyname FROM pg_policies WHERE tablename = 'tarefas_recorrencias';
