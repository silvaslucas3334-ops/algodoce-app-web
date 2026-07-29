-- Recorrência deixa de depender de automação por tempo (cron). Ao criar,
-- todas as ocorrências até data_fim são geradas de uma vez, na hora — visíveis
-- e editáveis por qualquer um na tela de Despesas desde o primeiro minuto,
-- em vez de só aparecerem no dia exato do vencimento (o que deixava a
-- recorrência invisível pra quem não a criou, causando lançamento duplicado).
-- Execute no Supabase SQL Editor.

CREATE OR REPLACE FUNCTION gerar_ocorrencias_recorrencia(p_recorrencia_id UUID) RETURNS INT AS $$
DECLARE
  rec RECORD;
  prox DATE;
  guarda INT := 0;
  criadas INT := 0;
BEGIN
  SELECT * INTO rec FROM financeiro_recorrencias WHERE id = p_recorrencia_id AND ativa;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF rec.data_fim IS NULL THEN
    RAISE EXCEPTION 'Recorrência sem data_fim — não é possível gerar ocorrências sem um limite.';
  END IF;

  prox := rec.proxima_data;
  -- Diferente de gerar_lancamentos_recorrentes() (que só alcança "hoje"),
  -- aqui NÃO há checagem de hoje — gera tudo adiantado até data_fim, de
  -- propósito (é isso que resolve o problema de visibilidade). Trava de
  -- segurança (guarda < 60 = 5 anos de teto) evita geração em looping.
  WHILE prox <= rec.data_fim AND guarda < 60 LOOP
    guarda := guarda + 1;
    INSERT INTO financeiro_lancamentos (
      tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento, data_competencia,
      status, forma_pagamento, condicao_pagamento, unidade, conta_id, recorrencia_id, criado_por
    ) VALUES (
      'despesa', rec.parte_id, rec.descricao, rec.valor, prox, prox,
      (date_trunc('month', prox) - (rec.competencia_deslocamento_meses || ' months')::interval)::date,
      'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id, rec.id, rec.criado_por
    );
    criadas := criadas + 1;
    prox := (date_trunc('month', prox) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date;
  END LOOP;

  -- Tudo já foi gerado — não sobra nada pra nenhum processo automático fazer depois.
  UPDATE financeiro_recorrencias SET proxima_data = prox, ativa = false, updated_at = now() WHERE id = rec.id;
  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nada mais deve gerar lançamento por conta própria com o passar do tempo —
-- desagenda o cron diário. A função gerar_lancamentos_recorrentes() continua
-- definida no banco (inofensiva) só sem agendamento.
DO $$ BEGIN
  PERFORM cron.unschedule('gerar-lancamentos-recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Verificação
SELECT proname FROM pg_proc WHERE proname = 'gerar_ocorrencias_recorrencia';
SELECT * FROM cron.job WHERE jobname = 'gerar-lancamentos-recorrentes'; -- deve retornar 0 linhas
