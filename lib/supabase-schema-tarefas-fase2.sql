-- ============================================
-- MÓDULO DE TAREFAS - FASE 2
-- Comentários/feedback do gestor + recorrência
-- ============================================
-- Convenção de dias_semana: 0=Segunda, 1=Terça, ..., 6=Domingo
-- Timezone de referência: America/Sao_Paulo

-- 1. TABELA TAREFAS_COMENTARIOS
-- ============================================
CREATE TABLE IF NOT EXISTS tarefas_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'comentario' CHECK (tipo IN ('comentario', 'feedback_refazer')),
  tentativa_num INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_tarefa ON tarefas_comentarios(tarefa_id);

ALTER TABLE tarefas_comentarios ENABLE ROW LEVEL SECURITY;

-- SELECT: admin ou mesmo setor da tarefa
CREATE POLICY comentarios_select ON tarefas_comentarios
FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR tarefa_id IN (
    SELECT id FROM tarefas
    WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
  )
);

-- INSERT: o próprio autor, admin ou usuário do setor da tarefa
CREATE POLICY comentarios_insert ON tarefas_comentarios
FOR INSERT WITH CHECK (
  usuario_id = auth.uid()
  AND (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR tarefa_id IN (
      SELECT id FROM tarefas
      WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
    )
  )
);

-- 2. TABELA TAREFAS_RECORRENCIAS
-- ============================================
-- Guarda o "molde" da tarefa recorrente (template inline, robusto a
-- alterações/conclusões das instâncias já geradas).
CREATE TABLE IF NOT EXISTS tarefas_recorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  setor_id UUID NOT NULL REFERENCES setores(id),
  responsavel_id UUID NOT NULL REFERENCES usuarios(id),
  foto_obrigatoria BOOLEAN NOT NULL,
  hora_limite TIME,
  frequencia TEXT NOT NULL CHECK (frequencia IN ('diaria', 'semanal', 'mensal')),
  dias_semana INT[],        -- semanal: 0=Seg .. 6=Dom
  dia_mes INT,              -- mensal: 1..31
  proxima_data DATE NOT NULL,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recorrencias_setor ON tarefas_recorrencias(setor_id);
CREATE INDEX IF NOT EXISTS idx_recorrencias_proxima ON tarefas_recorrencias(proxima_data) WHERE ativa;

ALTER TABLE tarefas_recorrencias ENABLE ROW LEVEL SECURITY;

-- SELECT: admin ou mesmo setor
CREATE POLICY recorrencias_select ON tarefas_recorrencias
FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL)
);

-- INSERT/UPDATE: apenas admin
CREATE POLICY recorrencias_insert_admin ON tarefas_recorrencias
FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY recorrencias_update_admin ON tarefas_recorrencias
FOR UPDATE
USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

-- 3. FUNÇÃO DE GERAÇÃO DE INSTÂNCIAS RECORRENTES
-- ============================================
-- Gera todas as instâncias vencidas (catch-up) e avança proxima_data.
-- Convenção de DOW convertida: app 0=Seg..6=Dom  <->  pg 0=Dom..6=Sáb
CREATE OR REPLACE FUNCTION gerar_tarefas_recorrentes()
RETURNS INT AS $$
DECLARE
  rec RECORD;
  hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  prox DATE;
  criadas INT := 0;
  guarda INT;
  app_dow INT;
BEGIN
  FOR rec IN
    SELECT * FROM tarefas_recorrencias WHERE ativa AND proxima_data <= hoje
  LOOP
    prox := rec.proxima_data;
    guarda := 0;

    WHILE prox <= hoje AND guarda < 400 LOOP
      guarda := guarda + 1;

      -- app_dow: 0=Seg..6=Dom
      app_dow := (EXTRACT(DOW FROM prox)::int + 6) % 7;

      -- Cria instância se o dia bate com a frequência
      IF rec.frequencia = 'diaria'
         OR (rec.frequencia = 'semanal' AND rec.dias_semana IS NOT NULL AND app_dow = ANY(rec.dias_semana))
         OR (rec.frequencia = 'mensal' AND EXTRACT(DAY FROM prox)::int = COALESCE(rec.dia_mes, EXTRACT(DAY FROM prox)::int))
      THEN
        INSERT INTO tarefas (
          titulo, descricao, setor_id, status, data_vencimento, hora_limite,
          criado_por, responsavel_original_id, responsavel_atual_id,
          foto_obrigatoria, tentativa_num
        ) VALUES (
          rec.titulo, rec.descricao, rec.setor_id, 'pendente', prox, rec.hora_limite,
          rec.criado_por, rec.responsavel_id, rec.responsavel_id,
          rec.foto_obrigatoria, 1
        );
        criadas := criadas + 1;
      END IF;

      -- Avança para o próximo candidato
      IF rec.frequencia = 'mensal' THEN
        prox := (prox + INTERVAL '1 month')::date;
      ELSE
        prox := prox + 1; -- diária e semanal avançam dia a dia
      END IF;
    END LOOP;

    UPDATE tarefas_recorrencias SET proxima_data = prox WHERE id = rec.id;
  END LOOP;

  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AGENDAMENTO (executar manualmente após criar a função)
-- ============================================
-- Requer extensão pg_cron (Dashboard > Database > Extensions > pg_cron).
-- Depois, agendar execução diária às 00:05 (horário do servidor UTC):
--
--   select cron.schedule(
--     'gerar-tarefas-recorrentes',
--     '5 3 * * *',                       -- 03:05 UTC = 00:05 America/Sao_Paulo
--     $$ select gerar_tarefas_recorrentes(); $$
--   );
--
-- Para rodar sob demanda / testar:  select gerar_tarefas_recorrentes();
