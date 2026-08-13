-- Permite cancelar uma ordem já desde "Pendente" (hoje só depois de
-- "Iniciar Produção") e notifica quem pediu quando isso acontece —
-- solicitado_por hoje é só texto livre, nunca deu pra saber quem é de
-- verdade pra notificar. Daqui pra frente, ordens/nova e
-- producao/ordem-interna passam a gravar solicitado_por_id também.
--
-- ordens_notificacoes espelha o mesmo desenho de tarefas_notificacoes
-- (ver lib/supabase-schema-tarefas.sql) — tabela nova e paralela, não
-- generaliza a de tarefas (evita mexer num sistema já em produção usado
-- todo dia).
--
-- Idempotente — seguro rodar mesmo que já existam em produção.
-- Execute no Supabase SQL Editor.

ALTER TABLE ordens_producao
  ADD COLUMN IF NOT EXISTS solicitado_por_id UUID REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

CREATE TABLE IF NOT EXISTS ordens_notificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id UUID NOT NULL REFERENCES ordens_producao(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL DEFAULT 'cancelada',
  mensagem TEXT,
  criado_por TEXT,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordens_notificacoes_usuario_nao_lida
  ON ordens_notificacoes(usuario_id) WHERE lida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_ordens_notificacoes_usuario_created
  ON ordens_notificacoes(usuario_id, created_at DESC);

ALTER TABLE ordens_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ordens_notificacoes_select_own ON ordens_notificacoes;
CREATE POLICY ordens_notificacoes_select_own ON ordens_notificacoes
FOR SELECT TO authenticated USING (usuario_id = auth.uid());

-- INSERT: quem cancela (cozinha ou admin) grava a notificação pro
-- solicitante — nunca é o próprio destinatário inserindo.
DROP POLICY IF EXISTS ordens_notificacoes_insert ON ordens_notificacoes;
CREATE POLICY ordens_notificacoes_insert ON ordens_notificacoes
FOR INSERT TO authenticated
WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

DROP POLICY IF EXISTS ordens_notificacoes_update_own ON ordens_notificacoes;
CREATE POLICY ordens_notificacoes_update_own ON ordens_notificacoes
FOR UPDATE TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (usuario_id = auth.uid());

-- Verificação
SELECT column_name FROM information_schema.columns WHERE table_name = 'ordens_producao' AND column_name IN ('solicitado_por_id', 'motivo_cancelamento');
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'ordens_notificacoes' ORDER BY cmd;
