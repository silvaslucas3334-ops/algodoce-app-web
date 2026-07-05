-- ============================================
-- MÓDULO DE GESTÃO DE TAREFAS - FASE 1
-- Criação de tabelas, RLS e seed
-- ============================================

-- 1. TABELA SETORES
-- ============================================
CREATE TABLE IF NOT EXISTS setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('operacional', 'administrativo')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: setores iniciais (4 ativos)
-- Nota: Financeiro/RH foram descontinuados e absorvidos por "Administrativo".
-- As funções financeiras futuras (OFX, lembretes - Fase 4) pertencem a Administrativo.
INSERT INTO setores (nome, tipo) VALUES
('Paraisópolis', 'operacional'),
('Itajubá', 'operacional'),
('Cozinha', 'operacional'),
('Administrativo', 'administrativo')
ON CONFLICT (nome) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_setores_tipo ON setores(tipo);

-- RLS em setores
ALTER TABLE setores ENABLE ROW LEVEL SECURITY;

CREATE POLICY setores_select_authenticated ON setores
FOR SELECT USING (true);

CREATE POLICY setores_insert_admin ON setores
FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY setores_update_admin ON setores
FOR UPDATE WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
);

-- 2. ALTER USUARIOS - ADICIONAR setor_id
-- ============================================
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS setor_id UUID REFERENCES setores(id);

-- Backfill de setor_id conforme mapeamento
UPDATE usuarios
SET setor_id = (SELECT id FROM setores WHERE nome = 'Paraisópolis')
WHERE loja_id = 'loja1' AND setor_id IS NULL;

UPDATE usuarios
SET setor_id = (SELECT id FROM setores WHERE nome = 'Itajubá')
WHERE loja_id = 'loja2' AND setor_id IS NULL;

UPDATE usuarios
SET setor_id = (SELECT id FROM setores WHERE nome = 'Cozinha')
WHERE role = 'cozinha' AND setor_id IS NULL;

-- Admin PODE ter setor (regra "admin NULL" foi revogada).
-- Admin é atribuído ao setor Administrativo e executa tarefas normalmente.
UPDATE usuarios
SET setor_id = (SELECT id FROM setores WHERE nome = 'Administrativo')
WHERE role = 'admin' AND setor_id IS NULL;

-- Índice para RLS
CREATE INDEX IF NOT EXISTS idx_usuarios_setor ON usuarios(setor_id);

-- 3. TABELA TAREFAS
-- ============================================
CREATE TABLE IF NOT EXISTS tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  setor_id UUID NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pronta_revisao', 'concluida', 'refazer_pendente', 'cancelada')),
  data_vencimento DATE NOT NULL,
  hora_limite TIME,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  responsavel_original_id UUID NOT NULL REFERENCES usuarios(id),
  responsavel_atual_id UUID NOT NULL REFERENCES usuarios(id),
  foto_obrigatoria BOOLEAN NOT NULL,
  tentativa_num INT NOT NULL DEFAULT 1 CHECK (tentativa_num >= 1),
  concluido_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tarefas_setor ON tarefas(setor_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas(responsavel_atual_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_vencimento ON tarefas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas(status);

-- RLS em tarefas
ALTER TABLE tarefas ENABLE ROW LEVEL SECURITY;

-- SELECT: admin OU colaborador do mesmo setor
CREATE POLICY tarefas_select ON tarefas
FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR
  setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
);

-- UPDATE status: colaborador onde responsavel_atual_id = auth.uid() AND status IN ('pendente', 'refazer_pendente')
CREATE POLICY tarefas_update_status_colaborador ON tarefas
FOR UPDATE
USING (
  responsavel_atual_id = auth.uid()
  AND status IN ('pendente', 'refazer_pendente')
)
WITH CHECK (
  responsavel_atual_id = auth.uid()
  AND status IN ('pronta_revisao')
);

-- UPDATE: admin pode alterar qualquer coisa (exceto DELETE)
CREATE POLICY tarefas_update_admin ON tarefas
FOR UPDATE
USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
);

-- INSERT: admin only
CREATE POLICY tarefas_insert_admin ON tarefas
FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
);

-- DELETE: bloqueado (preservar auditoria)
CREATE POLICY tarefas_delete_blocked ON tarefas
FOR DELETE USING (false);

-- 4. TABELA TAREFAS_EVIDENCIAS
-- ============================================
CREATE TABLE IF NOT EXISTS tarefas_evidencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  tentativa_num INT NOT NULL CHECK (tentativa_num >= 1),
  foto_url TEXT NOT NULL,
  data_upload TIMESTAMPTZ DEFAULT now(),
  uploaded_by UUID NOT NULL REFERENCES usuarios(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_evidencias_tarefa ON tarefas_evidencias(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_tentativa ON tarefas_evidencias(tarefa_id, tentativa_num);

-- RLS em tarefas_evidencias
ALTER TABLE tarefas_evidencias ENABLE ROW LEVEL SECURITY;

-- SELECT: usuários do mesmo setor da tarefa + admin
CREATE POLICY evidencias_select ON tarefas_evidencias
FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR
  tarefa_id IN (
    SELECT id FROM tarefas
    WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
  )
);

-- INSERT: colaborador upload para sua tarefa (responsavel_atual_id)
CREATE POLICY evidencias_insert ON tarefas_evidencias
FOR INSERT WITH CHECK (
  uploaded_by = auth.uid()
  AND tarefa_id IN (
    SELECT id FROM tarefas WHERE responsavel_atual_id = auth.uid()
  )
);

-- 5. TABELA TAREFAS_HISTORICO
-- ============================================
CREATE TABLE IF NOT EXISTS tarefas_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  alteracao_tipo TEXT NOT NULL CHECK (alteracao_tipo IN ('status_change', 'reatribuicao', 'cancelamento')),
  dados_json JSONB NOT NULL,
  registrado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_historico_tarefa ON tarefas_historico(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_historico_tipo ON tarefas_historico(alteracao_tipo);

-- RLS em tarefas_historico
ALTER TABLE tarefas_historico ENABLE ROW LEVEL SECURITY;

-- SELECT: usuários do mesmo setor da tarefa + admin
CREATE POLICY historico_select ON tarefas_historico
FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR
  tarefa_id IN (
    SELECT id FROM tarefas
    WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
  )
);

-- INSERT: usuário autenticado registra histórico das tarefas que pode acessar
CREATE POLICY historico_insert_auth ON tarefas_historico
FOR INSERT WITH CHECK (
  registrado_por = auth.uid()
  AND (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR tarefa_id IN (
      SELECT id FROM tarefas
      WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
    )
  )
);

-- ============================================
-- INSTRUÇÕES MANUAIS (via Supabase Dashboard)
-- ============================================
-- 1. Criar bucket Storage: tarafas-provas (privado)
-- 2. Policies do bucket:
--    - Upload: path = "{setor_id}/{tarefa_id}/{tentativa_num}/*"
--      WHERE (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
--      OR auth.uid() IN (SELECT id FROM usuarios WHERE setor_id = CAST(storage.foldername[1] AS uuid))
--    - Download/List: mesmo acesso que upload
-- 3. Criar Edge Function para geração automática de recorrências (Phase 2)
