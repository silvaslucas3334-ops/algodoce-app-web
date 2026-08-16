-- ============================================================
-- Lançamento "não-caixa" — entra no resultado (competência) mas não
-- gera evento de fluxo de caixa/contas a pagar (ver lib/financeiro-dre.ts,
-- que já lê por competência independente de status de pagamento).
--
-- Caso de uso: Taxa de Cartão (2004) e Comissão de Delivery (2003) —
-- o dinheiro já sai antes de chegar no banco, então nunca existe um
-- pagamento de verdade a rastrear. Default true preserva 100% do
-- comportamento atual de tudo que já existe.
-- ============================================================

ALTER TABLE financeiro_lancamentos ADD COLUMN IF NOT EXISTS afeta_fluxo_caixa BOOLEAN NOT NULL DEFAULT true;

-- Verificação
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'financeiro_lancamentos' AND column_name = 'afeta_fluxo_caixa';
