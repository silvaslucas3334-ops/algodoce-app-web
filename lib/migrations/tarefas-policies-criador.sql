-- Formaliza no controle de versão duas policies que já estão documentadas no
-- CLAUDE.md (edição/cancelamento de tarefa pelo próprio criador; INSERT de
-- colaborador) mas nunca foram commitadas como SQL — só existiam aplicadas
-- manualmente no Supabase, sem reprodutibilidade. Não muda a regra: colaborador
-- só edita/cancela a própria tarefa, ainda 'pendente' e sem evidência enviada.
-- Idempotente — seguro rodar mesmo que já existam em produção.
-- Execute no Supabase SQL Editor.

-- Evita recursão de RLS ao consultar tarefas_evidencias dentro de uma policy
-- de UPDATE em tarefas.
CREATE OR REPLACE FUNCTION tarefa_sem_evidencia(p_tarefa_id UUID) RETURNS BOOLEAN AS $$
  SELECT NOT EXISTS (SELECT 1 FROM tarefas_evidencias WHERE tarefa_id = p_tarefa_id);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS tarefas_update_criador ON tarefas;
CREATE POLICY tarefas_update_criador ON tarefas FOR UPDATE
USING (
  criado_por = auth.uid()
  AND status = 'pendente'
  AND tarefa_sem_evidencia(id)
)
WITH CHECK (
  criado_por = auth.uid()
);

DROP POLICY IF EXISTS tarefas_insert_colaborador ON tarefas;
CREATE POLICY tarefas_insert_colaborador ON tarefas FOR INSERT WITH CHECK (
  criado_por = auth.uid()
  AND setor_id = (SELECT setor_id FROM usuarios WHERE id = auth.uid())
);

-- Verificação
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tarefas' ORDER BY policyname;
