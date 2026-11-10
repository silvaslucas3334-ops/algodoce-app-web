-- Corrige a competência das despesas criadas em lote a partir do extrato (10/11/2026)
--
-- PROBLEMA: "Criar despesas em lote" (conciliação do extrato) não gravava `data_competencia`; o banco
-- usava o padrão CURRENT_DATE, ou seja, o DIA EM QUE SE CONCILIOU (em UTC), não o dia da transação.
-- Despesas conciliadas no mês seguinte caíam no mês errado do DRE.
-- O front já foi corrigido (passa a gravar competência = data da transação). Este script conserta as já
-- gravadas.
--
-- CRITÉRIO (conferido no banco em 10/11/2026: 459 lançamentos, 30 deles mudam de mês, R$ 1.727,18):
--   * tipo despesa, vinculada a uma transação do extrato;
--   * descrição no padrão do lote: "<texto> — dd/mm/aaaa", com a data igual à data do lançamento;
--   * competência diferente da data do lançamento E igual ao dia da criação do registro (UTC) — ou seja,
--     só mexe em quem recebeu o valor padrão; quem teve a competência editada à mão fica de fora.
--
-- Efeito nas telas: 30 despesas voltam do mês em que foram conciliadas para o mês da transação no DRE
-- (transação de julho conciliada em agosto: 4; ago→set: 3; set→out: 17; out→nov: 6). As 429 restantes
-- mudam só o dia dentro do mesmo mês (sem efeito no DRE mensal). A auditoria de lançamentos (Fase 6a)
-- registra cada alteração.
--
-- Execute no Supabase SQL Editor em partes (o editor mostra só o último resultado):
-- (1) PRÉVIA  (2) BACKUP + CORREÇÃO  (3) VERIFICAÇÃO

-- (1) PRÉVIA — esperado hoje: 459 | 30 | 1727.18 (o total pode ser um pouco maior se houve novos lotes)
SELECT count(*) AS lancamentos_a_corrigir,
       count(*) FILTER (WHERE to_char(data_competencia, 'YYYY-MM') <> to_char(data_lancamento, 'YYYY-MM')) AS mudam_de_mes,
       sum(valor_total) FILTER (WHERE to_char(data_competencia, 'YYYY-MM') <> to_char(data_lancamento, 'YYYY-MM')) AS valor_que_muda_de_mes
FROM financeiro_lancamentos
WHERE tipo = 'despesa'
  AND extrato_transacao_id IS NOT NULL
  AND descricao LIKE '% — ' || to_char(data_lancamento, 'DD/MM/YYYY')
  AND data_competencia IS DISTINCT FROM data_lancamento
  AND data_competencia = (created_at AT TIME ZONE 'UTC')::date;

-- (2) BACKUP + CORREÇÃO (numa transação: ou faz tudo, ou nada)
BEGIN;

CREATE TABLE IF NOT EXISTS _bkp_competencia_20261110 AS
SELECT id, data_competencia AS competencia_antes
FROM financeiro_lancamentos
WHERE tipo = 'despesa'
  AND extrato_transacao_id IS NOT NULL
  AND descricao LIKE '% — ' || to_char(data_lancamento, 'DD/MM/YYYY')
  AND data_competencia IS DISTINCT FROM data_lancamento
  AND data_competencia = (created_at AT TIME ZONE 'UTC')::date;

UPDATE financeiro_lancamentos l
SET data_competencia = l.data_lancamento,
    updated_at = now()
FROM _bkp_competencia_20261110 b
WHERE l.id = b.id;

COMMIT;

-- (3) VERIFICAÇÃO — esperado: 0 (nenhum lançamento ainda no padrão do problema)
SELECT count(*) AS ainda_com_competencia_errada
FROM financeiro_lancamentos
WHERE tipo = 'despesa'
  AND extrato_transacao_id IS NOT NULL
  AND descricao LIKE '% — ' || to_char(data_lancamento, 'DD/MM/YYYY')
  AND data_competencia IS DISTINCT FROM data_lancamento
  AND data_competencia = (created_at AT TIME ZONE 'UTC')::date;

-- Conferência do backup (deve ter a mesma quantidade da prévia):
-- SELECT count(*) FROM _bkp_competencia_20261110;

-- ROLLBACK (se precisar voltar à competência anterior):
-- UPDATE financeiro_lancamentos l
-- SET data_competencia = b.competencia_antes, updated_at = now()
-- FROM _bkp_competencia_20261110 b WHERE l.id = b.id;
--
-- Quando tudo estiver conferido, remova o backup:
-- DROP TABLE IF EXISTS _bkp_competencia_20261110;
