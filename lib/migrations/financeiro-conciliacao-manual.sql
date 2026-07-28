-- Conciliação manual: (1) permite várias despesas já lançadas apontarem pra
-- UMA mesma transação do extrato (ex: fornecedor com várias entregas pagas
-- de uma vez só) e (2) registra juros/multa quando o valor pago no banco
-- vem maior que o valor lançado (boleto atrasado), sem sobrescrever o valor
-- original silenciosamente.
-- Execute no Supabase SQL Editor.

-- Antes, só 1 despesa podia apontar pra 1 transação (idx_fl_extrato_transacao_unico,
-- ver add-indice-unico-extrato-lancamento.sql). Isso bloqueia o caso de N
-- despesas somando 1 pagamento só. A proteção original (evitar vínculo
-- duplicado por race condition — INSERT de lançamento sucede, UPDATE de
-- vínculo seguinte falha, retry duplica) passa a ser responsabilidade da
-- aplicação (confirmarConciliacaoManual em lib/financeiro-reconciliacao.ts,
-- mesmo padrão defensivo — guarda por estado esperado + contagem de linhas
-- afetadas — já usado em confirmarConciliacaoGrupo).
DROP INDEX IF EXISTS idx_fl_extrato_transacao_unico;
CREATE INDEX IF NOT EXISTS idx_fl_extrato_transacao_id
  ON financeiro_lancamentos(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;

-- Diferença entre o valor lançado originalmente e o valor realmente pago
-- (juros/multa por atraso), pra exibir separado do valor principal — nunca
-- embutido em silêncio dentro de valor_total sem rastro.
ALTER TABLE financeiro_lancamentos ADD COLUMN IF NOT EXISTS valor_juros_multa NUMERIC DEFAULT 0;

-- Verificação
SELECT indexname FROM pg_indexes WHERE tablename = 'financeiro_lancamentos' AND indexname LIKE 'idx_fl_extrato_transacao%';
SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'financeiro_lancamentos' AND column_name = 'valor_juros_multa';
