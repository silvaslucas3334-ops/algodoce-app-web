-- "Afeta o fluxo de caixa" deixa de ser um checkbox livre na tela de Nova
-- Despesa (código 2003/2004 hardcoded lá) e vira uma propriedade da própria
-- conta contábil, configurável só pelo admin no Plano de Contas — mesmo
-- padrão de afeta_dre. Evita o usuário escolher a combinação errada
-- (conta certa + checkbox errado, ou vice-versa) na hora de lançar.
--
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_contas ADD COLUMN IF NOT EXISTS afeta_fluxo_caixa BOOLEAN NOT NULL DEFAULT true;

-- Backfill: só 2003 (Taxa de Cartão) e 2004 (Comissão de Delivery) são
-- não-caixa hoje — mesmas duas contas que a tela pré-marcava sozinha.
UPDATE financeiro_contas SET afeta_fluxo_caixa = false WHERE codigo IN ('2003', '2004');

-- Verificação
SELECT codigo, nome, afeta_fluxo_caixa FROM financeiro_contas ORDER BY codigo;
