-- Reescreve gerar_lancamentos_recorrentes() com duas proteções que faltavam:
-- (1) respeita data_fim da recorrência (ver financeiro-recorrencia-inicio-fim.sql,
--     execute essa migration ANTES desta) e desativa sozinha ao ultrapassar;
-- (2) ganha um laço com trava (guarda < 60 = 5 anos de teto) — hoje a função
--     só cria 1 lançamento por execução e depende do cron rodar todo dia pra
--     alcançar o mês atual; com o laço, uma recorrência esquecida por meses
--     se atualiza numa chamada só, sem risco de rodar pra sempre.
-- Mesmo padrão de proteção já usado em gerar_tarefas_recorrentes()
-- (lib/supabase-schema-tarefas-fase2.sql).
-- Execute no Supabase SQL Editor.

DROP FUNCTION IF EXISTS gerar_lancamentos_recorrentes();
CREATE FUNCTION gerar_lancamentos_recorrentes() RETURNS INT AS $$
DECLARE
  rec RECORD;
  hoje_sp DATE;
  prox DATE;
  guarda INT;
  criadas INT := 0;
BEGIN
  hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  FOR rec IN
    SELECT * FROM financeiro_recorrencias WHERE ativa AND proxima_data <= hoje_sp
  LOOP
    prox := rec.proxima_data;
    guarda := 0;

    WHILE prox <= hoje_sp AND (rec.data_fim IS NULL OR prox <= rec.data_fim) AND guarda < 60 LOOP
      guarda := guarda + 1;

      INSERT INTO financeiro_lancamentos (
        tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento, data_competencia,
        status, forma_pagamento, condicao_pagamento, unidade, conta_id,
        recorrencia_id, criado_por
      ) VALUES (
        'despesa', rec.parte_id, rec.descricao, rec.valor, prox, prox,
        (date_trunc('month', prox) - (rec.competencia_deslocamento_meses || ' months')::interval)::date,
        'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id,
        rec.id, rec.criado_por
      );
      criadas := criadas + 1;

      prox := (date_trunc('month', prox) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date;
    END LOOP;

    UPDATE financeiro_recorrencias
    SET proxima_data = prox,
        ativa = NOT (rec.data_fim IS NOT NULL AND prox > rec.data_fim),
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;

  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Garante que o agendamento existe — idempotente (unschedule antes evita
-- erro de job duplicado se já estiver agendado). Se isso nunca tinha sido
-- executado antes, é a causa raiz de nenhuma despesa recorrente ter sido
-- gerada automaticamente até hoje.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('gerar-lancamentos-recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('gerar-lancamentos-recorrentes', '15 3 * * *', 'SELECT gerar_lancamentos_recorrentes()');

-- Verificação: confirma que a função foi recriada
SELECT proname, prorettype::regtype FROM pg_proc WHERE proname = 'gerar_lancamentos_recorrentes';

-- Verificação do agendamento
SELECT * FROM cron.job WHERE jobname = 'gerar-lancamentos-recorrentes';

-- Rode manualmente uma vez pra colocar em dia as recorrências já
-- cadastradas (gera as despesas dos meses que ficaram pra trás):
-- SELECT gerar_lancamentos_recorrentes();
