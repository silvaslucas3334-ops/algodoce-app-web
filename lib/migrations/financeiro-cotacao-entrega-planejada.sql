-- Prazo de entrega pedido ao fornecedor (não é uma promessa dele) — definido
-- na criação da cotação, impresso no PDF que sai antes de qualquer resposta.
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_cotacoes ADD COLUMN IF NOT EXISTS data_entrega_planejada DATE;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'financeiro_cotacoes' AND column_name = 'data_entrega_planejada';
