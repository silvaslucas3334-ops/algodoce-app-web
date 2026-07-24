-- ============================================================
-- Envolvidos em tarefas recorrentes — hoje só existe pra tarefa avulsa
-- (tarefas_envolvidos). Uma recorrência (molde) precisa de sua própria
-- lista, copiada pra tarefas_envolvidos de cada instância gerada.
-- ============================================================

CREATE TABLE IF NOT EXISTS tarefas_recorrencias_envolvidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorrencia_id UUID NOT NULL REFERENCES tarefas_recorrencias(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  UNIQUE(recorrencia_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_recorrencias_envolvidos_recorrencia ON tarefas_recorrencias_envolvidos(recorrencia_id);

ALTER TABLE tarefas_recorrencias_envolvidos ENABLE ROW LEVEL SECURITY;

-- Mesma regra de tarefas_recorrencias (admin OU mesmo setor — não é "só quem criou").
DROP POLICY IF EXISTS recorrencias_envolvidos_select ON tarefas_recorrencias_envolvidos;
CREATE POLICY recorrencias_envolvidos_select ON tarefas_recorrencias_envolvidos FOR SELECT USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR recorrencia_id IN (SELECT id FROM tarefas_recorrencias WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL))
);
DROP POLICY IF EXISTS recorrencias_envolvidos_insert ON tarefas_recorrencias_envolvidos;
CREATE POLICY recorrencias_envolvidos_insert ON tarefas_recorrencias_envolvidos FOR INSERT WITH CHECK (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR recorrencia_id IN (SELECT id FROM tarefas_recorrencias WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL))
);
DROP POLICY IF EXISTS recorrencias_envolvidos_delete ON tarefas_recorrencias_envolvidos;
CREATE POLICY recorrencias_envolvidos_delete ON tarefas_recorrencias_envolvidos FOR DELETE USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
  OR recorrencia_id IN (SELECT id FROM tarefas_recorrencias WHERE setor_id IN (SELECT setor_id FROM usuarios WHERE id = auth.uid() AND setor_id IS NOT NULL))
);

-- gerar_tarefas_recorrentes(): mesma lógica de lib/supabase-schema-tarefas-fase2-1.sql,
-- só adiciona RETURNING id + a cópia pra tarefas_envolvidos da instância nova.
-- SECURITY DEFINER já ignora RLS nas tabelas que toca (é assim que o INSERT em
-- tarefas já funciona hoje apesar da policy exigir criado_por = auth.uid()),
-- então o INSERT em tarefas_envolvidos aqui dentro não precisa de policy extra.
CREATE OR REPLACE FUNCTION gerar_tarefas_recorrentes()
RETURNS INT AS $$
DECLARE
  rec RECORD;
  hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  d DATE;
  ini DATE;
  fim DATE;
  criadas INT := 0;
  app_dow INT;
  nova_tarefa_id UUID;
BEGIN
  FOR rec IN SELECT * FROM tarefas_recorrencias WHERE ativa LOOP
    ini := GREATEST(COALESCE(rec.data_inicio, rec.proxima_data), hoje);
    fim := LEAST(hoje + 30, COALESCE(rec.data_fim, hoje + 30));
    d := ini;
    WHILE d <= fim LOOP
      app_dow := (EXTRACT(DOW FROM d)::int + 6) % 7;
      IF (
           rec.frequencia = 'diaria'
           OR (rec.frequencia = 'semanal' AND rec.dias_semana IS NOT NULL AND app_dow = ANY(rec.dias_semana))
           OR (rec.frequencia = 'mensal' AND EXTRACT(DAY FROM d)::int = COALESCE(rec.dia_mes, EXTRACT(DAY FROM d)::int))
         )
         AND NOT EXISTS (SELECT 1 FROM tarefas WHERE recorrencia_id = rec.id AND data_vencimento = d)
      THEN
        INSERT INTO tarefas (
          titulo, descricao, setor_id, status, data_vencimento, hora_limite,
          criado_por, responsavel_original_id, responsavel_atual_id,
          foto_obrigatoria, tentativa_num, recorrencia_id
        ) VALUES (
          rec.titulo, rec.descricao, rec.setor_id, 'pendente', d, rec.hora_limite,
          rec.criado_por, rec.responsavel_id, rec.responsavel_id,
          rec.foto_obrigatoria, 1, rec.id
        )
        RETURNING id INTO nova_tarefa_id;

        INSERT INTO tarefas_envolvidos (tarefa_id, usuario_id)
        SELECT nova_tarefa_id, usuario_id FROM tarefas_recorrencias_envolvidos WHERE recorrencia_id = rec.id
        ON CONFLICT (tarefa_id, usuario_id) DO NOTHING;

        criadas := criadas + 1;
      END IF;
      d := d + 1;
    END LOOP;
    UPDATE tarefas_recorrencias SET proxima_data = fim + 1 WHERE id = rec.id;
  END LOOP;
  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION gerar_tarefas_recorrentes() TO authenticated;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tarefas_recorrencias_envolvidos' ORDER BY ordinal_position;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tarefas_recorrencias_envolvidos' ORDER BY cmd;
