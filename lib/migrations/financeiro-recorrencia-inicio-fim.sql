-- Início/fim da recorrência: fim opcional (NULL = sem fim definido, gera
-- indefinidamente enquanto ativa). Guiam gerar_lancamentos_recorrentes()
-- pra nunca gerar além do previsto — proteção que faltava.
-- Execute no Supabase SQL Editor, ANTES da migration
-- financeiro-gerar-lancamentos-recorrentes-v2.sql.

ALTER TABLE financeiro_recorrencias ADD COLUMN IF NOT EXISTS data_inicio DATE;
ALTER TABLE financeiro_recorrencias ADD COLUMN IF NOT EXISTS data_fim DATE;
UPDATE financeiro_recorrencias SET data_inicio = proxima_data WHERE data_inicio IS NULL;
ALTER TABLE financeiro_recorrencias ALTER COLUMN data_inicio SET NOT NULL;
ALTER TABLE financeiro_recorrencias ALTER COLUMN data_inicio SET DEFAULT CURRENT_DATE;

-- Verificação
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'financeiro_recorrencias' AND column_name IN ('data_inicio', 'data_fim');
