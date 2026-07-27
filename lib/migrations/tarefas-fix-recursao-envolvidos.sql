-- Fix: "infinite recursion detected in policy for relation tarefas" ao
-- aprovar/concluir/cancelar qualquer tarefa (afeta TODO update em tarefas,
-- não só ações de envolvido, porque as policies de UPDATE são avaliadas
-- juntas via OR).
--
-- Causa: tarefas_update_status_colaborador e tarefas_update_envolvido_cancelar
-- consultavam tarefas_envolvidos direto (EXISTS ...). A policy de SELECT de
-- tarefas_envolvidos (envolvidos_select) consulta tarefas de volta pra
-- checar setor_id, fechando o ciclo tarefas -> tarefas_envolvidos -> tarefas.
--
-- Fix: mesmo padrão já usado em tarefa_sem_evidencia() — uma function
-- SECURITY DEFINER quebra o ciclo, porque a consulta interna não passa pela
-- RLS de tarefas_envolvidos.
--
-- Idempotente — seguro rodar mesmo que já existam em produção.
-- Execute no Supabase SQL Editor.

CREATE OR REPLACE FUNCTION usuario_envolvido_na_tarefa(p_tarefa_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM tarefas_envolvidos WHERE tarefa_id = p_tarefa_id AND usuario_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS tarefas_update_status_colaborador ON tarefas;
CREATE POLICY tarefas_update_status_colaborador ON tarefas
FOR UPDATE
USING (
  status IN ('pendente', 'refazer_pendente')
  AND (
    responsavel_atual_id = auth.uid()
    OR usuario_envolvido_na_tarefa(id)
  )
)
WITH CHECK (
  status IN ('pronta_revisao')
  AND (
    responsavel_atual_id = auth.uid()
    OR usuario_envolvido_na_tarefa(id)
  )
);

DROP POLICY IF EXISTS tarefas_update_envolvido_cancelar ON tarefas;
CREATE POLICY tarefas_update_envolvido_cancelar ON tarefas FOR UPDATE
USING (
  status = 'pendente'
  AND tarefa_sem_evidencia(id)
  AND usuario_envolvido_na_tarefa(id)
)
WITH CHECK (
  status = 'cancelada'
  AND usuario_envolvido_na_tarefa(id)
);

-- Verificação
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tarefas' ORDER BY policyname;
