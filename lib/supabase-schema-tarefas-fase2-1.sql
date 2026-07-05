-- ============================================
-- MÓDULO DE TAREFAS - FASE 2.1
-- Vigência da recorrência + geração efetiva por janela (30 dias)
-- ============================================

-- 1. Vínculo instância -> recorrência (rastreabilidade + anti-duplicação)
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS recorrencia_id UUID REFERENCES tarefas_recorrencias(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tarefa_recorrencia_data
  ON tarefas(recorrencia_id, data_vencimento)
  WHERE recorrencia_id IS NOT NULL;

-- 2. Período de vigência da recorrência
ALTER TABLE tarefas_recorrencias ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE tarefas_recorrencias ADD COLUMN IF NOT EXISTS data_fim DATE;

-- Backfill: recorrências antigas usam proxima_data como início
UPDATE tarefas_recorrencias SET data_inicio = proxima_data WHERE data_inicio IS NULL;

-- 3. Função de geração por JANELA (idempotente, catch-up de 30 dias)
--    Convenção dias_semana: 0=Segunda .. 6=Domingo | Timezone America/Sao_Paulo
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
BEGIN
  FOR rec IN SELECT * FROM tarefas_recorrencias WHERE ativa LOOP
    -- Janela: de max(inicio, hoje) até min(hoje+30, fim)
    ini := GREATEST(COALESCE(rec.data_inicio, rec.proxima_data), hoje);
    fim := LEAST(hoje + 30, COALESCE(rec.data_fim, hoje + 30));

    d := ini;
    WHILE d <= fim LOOP
      app_dow := (EXTRACT(DOW FROM d)::int + 6) % 7; -- 0=Seg..6=Dom

      IF (
           rec.frequencia = 'diaria'
           OR (rec.frequencia = 'semanal' AND rec.dias_semana IS NOT NULL AND app_dow = ANY(rec.dias_semana))
           OR (rec.frequencia = 'mensal' AND EXTRACT(DAY FROM d)::int = COALESCE(rec.dia_mes, EXTRACT(DAY FROM d)::int))
         )
         AND NOT EXISTS (
           SELECT 1 FROM tarefas WHERE recorrencia_id = rec.id AND data_vencimento = d
         )
      THEN
        INSERT INTO tarefas (
          titulo, descricao, setor_id, status, data_vencimento, hora_limite,
          criado_por, responsavel_original_id, responsavel_atual_id,
          foto_obrigatoria, tentativa_num, recorrencia_id
        ) VALUES (
          rec.titulo, rec.descricao, rec.setor_id, 'pendente', d, rec.hora_limite,
          rec.criado_por, rec.responsavel_id, rec.responsavel_id,
          rec.foto_obrigatoria, 1, rec.id
        );
        criadas := criadas + 1;
      END IF;

      d := d + 1;
    END LOOP;

    -- proxima_data serve só como cursor informativo agora
    UPDATE tarefas_recorrencias SET proxima_data = fim + 1 WHERE id = rec.id;
  END LOOP;

  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permitir chamada via RPC pelo app (geração imediata na criação)
GRANT EXECUTE ON FUNCTION gerar_tarefas_recorrentes() TO authenticated;

-- 4. Cancelar uma recorrência: desativa + cancela instâncias FUTURAS ainda pendentes
CREATE OR REPLACE FUNCTION cancelar_recorrencia(rec_id UUID)
RETURNS INT AS $$
DECLARE
  hoje DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  canceladas INT := 0;
BEGIN
  UPDATE tarefas_recorrencias SET ativa = false WHERE id = rec_id;

  UPDATE tarefas
  SET status = 'cancelada', updated_at = now()
  WHERE recorrencia_id = rec_id
    AND data_vencimento >= hoje
    AND status IN ('pendente', 'refazer_pendente');
  GET DIAGNOSTICS canceladas = ROW_COUNT;

  RETURN canceladas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cancelar_recorrencia(UUID) TO authenticated;
