-- Unidade em que o fornecedor efetivamente vende o item (ex: pacote de 5kg),
-- separada da unidade_compra (kg) que o sistema usa internamente. Só serve
-- pra calcular quantos pacotes pedir no PDF da cotação e pra digitar o
-- preço no mesmo formato que o fornecedor cotou de volta — nunca entra nas
-- contas de custo/CMV (essas continuam só em unidade_compra/fator_conversao).
-- Ambos opcionais: sem preencher, comportamento idêntico ao de hoje.
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_materias_primas ADD COLUMN IF NOT EXISTS unidade_fornecedor TEXT;
ALTER TABLE financeiro_materias_primas ADD COLUMN IF NOT EXISTS fator_unidade_fornecedor NUMERIC;

ALTER TABLE financeiro_materias_primas DROP CONSTRAINT IF EXISTS fmp_fator_unidade_fornecedor_positivo;
ALTER TABLE financeiro_materias_primas ADD CONSTRAINT fmp_fator_unidade_fornecedor_positivo
  CHECK (fator_unidade_fornecedor IS NULL OR fator_unidade_fornecedor > 0);

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_materias_primas' AND column_name IN ('unidade_fornecedor', 'fator_unidade_fornecedor');
