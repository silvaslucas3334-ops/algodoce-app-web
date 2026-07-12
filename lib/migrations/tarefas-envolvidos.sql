-- Múltiplos "envolvidos" numa tarefa, além do responsável — o colaborador que
-- de fato executa às vezes não é quem foi originalmente atribuído. Envolvidos
-- também podem concluir a tarefa e subir a foto de evidência, igual ao
-- responsável. Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS tarefas_envolvidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tarefa_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_envolvidos_tarefa ON tarefas_envolvidos(tarefa_id);

ALTER TABLE tarefas_envolvidos ENABLE ROW LEVEL SECURITY;

-- SELECT: mesmo padrão genérico das outras tabelas do módulo (admin OU mesmo setor)
DROP POLICY IF EXISTS envolvidos_select ON tarefas_envolvidos;
CREATE POLICY envolvidos_select ON tarefas_envolvidos FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR tarefa_id IN (
    SELECT id FROM tarefas
    WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
  )
);

-- INSERT/DELETE: quem criou a tarefa ou admin (espelha quem pode editar a tarefa)
DROP POLICY IF EXISTS envolvidos_insert ON tarefas_envolvidos;
CREATE POLICY envolvidos_insert ON tarefas_envolvidos FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR tarefa_id IN (SELECT id FROM tarefas WHERE criado_por = auth.uid())
);

DROP POLICY IF EXISTS envolvidos_delete ON tarefas_envolvidos;
CREATE POLICY envolvidos_delete ON tarefas_envolvidos FOR DELETE USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR tarefa_id IN (SELECT id FROM tarefas WHERE criado_por = auth.uid())
);

-- Estende as policies existentes que hoje só olham responsavel_atual_id, para
-- também aceitar quem está em tarefas_envolvidos.

DROP POLICY IF EXISTS tarefas_update_status_colaborador ON tarefas;
CREATE POLICY tarefas_update_status_colaborador ON tarefas
FOR UPDATE
USING (
  status IN ('pendente', 'refazer_pendente')
  AND (
    responsavel_atual_id = auth.uid()
    OR EXISTS (SELECT 1 FROM tarefas_envolvidos WHERE tarefa_id = tarefas.id AND usuario_id = auth.uid())
  )
)
WITH CHECK (
  status IN ('pronta_revisao')
  AND (
    responsavel_atual_id = auth.uid()
    OR EXISTS (SELECT 1 FROM tarefas_envolvidos WHERE tarefa_id = tarefas.id AND usuario_id = auth.uid())
  )
);

DROP POLICY IF EXISTS evidencias_insert ON tarefas_evidencias;
CREATE POLICY evidencias_insert ON tarefas_evidencias
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid()
  AND tarefa_id IN (
    SELECT id FROM tarefas WHERE responsavel_atual_id = auth.uid()
    UNION
    SELECT tarefa_id FROM tarefas_envolvidos WHERE usuario_id = auth.uid()
  )
);

-- Verificação
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('tarefas_envolvidos', 'tarefas', 'tarefas_evidencias') ORDER BY tablename, policyname;
