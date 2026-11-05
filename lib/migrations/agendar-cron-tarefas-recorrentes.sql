-- Agenda a geração diária das tarefas recorrentes.
--
-- gerar_tarefas_recorrentes() só cria instâncias pros próximos 30 dias, e o
-- agendamento dela (pg_cron) nunca foi ligado — o comentário em
-- lib/supabase-schema-tarefas-fase2.sql dizia "executar manualmente após criar
-- a função". Na prática as tarefas só eram geradas quando alguém criava ou
-- editava uma recorrência pela tela (NovaTarefaModal / EditarRecorrenciaModal).
-- Quando isso parou de acontecer (última geração ~30/09), a janela de 30 dias
-- acabou em 30/10 e a tela de Tarefas ficou vazia (hoje e dias seguintes), sem
-- erro nenhum. Não tinha relação com o limite de 1000 linhas do PostgREST.
--
-- 03:05 UTC = 00:05 America/Sao_Paulo. A função é idempotente (NOT EXISTS por
-- recorrencia_id + data_vencimento), então rodar de novo nunca duplica.
--
-- Execute no Supabase SQL Editor.

DO $$
BEGIN
  PERFORM cron.unschedule('gerar-tarefas-recorrentes');
EXCEPTION WHEN OTHERS THEN
  NULL; -- ainda não existia
END $$;

SELECT cron.schedule('gerar-tarefas-recorrentes', '5 3 * * *', 'SELECT gerar_tarefas_recorrentes()');

-- Repõe agora as tarefas dos próximos 30 dias (não retroage: instâncias de
-- dias que já passaram não são criadas, pra não nascerem como "atrasadas").
SELECT gerar_tarefas_recorrentes();

-- Verificação
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'gerar-tarefas-recorrentes';
SELECT max(data_vencimento) AS ultima_data_gerada FROM tarefas;
