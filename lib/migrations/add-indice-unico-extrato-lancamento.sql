-- Sem isso, nada impede duas despesas apontando pra mesma transação de
-- extrato (ex: INSERT do lançamento sucede mas o UPDATE de vínculo
-- seguinte falha — a transação continua "pendente" e uma segunda
-- tentativa criaria um lançamento duplicado). financeiro_receitas já
-- tem essa proteção (idx_fr_extrato_transacao_unico); replicando aqui.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fl_extrato_transacao_unico
  ON financeiro_lancamentos(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;

-- Verificação
SELECT indexname FROM pg_indexes WHERE tablename = 'financeiro_lancamentos' AND indexname = 'idx_fl_extrato_transacao_unico';
