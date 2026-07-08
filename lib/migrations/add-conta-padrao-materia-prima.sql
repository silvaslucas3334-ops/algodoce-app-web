-- Classificação contábil por ITEM, não por nota: uma NF pode misturar
-- matéria-prima (conta 1001) e embalagem (conta 1002), então a conta
-- contábil sai do lançamento e passa a morar no cadastro da matéria-prima.
-- Cada linha de compra herda a conta do cadastro do item no momento do
-- lançamento; o admin ainda pode reclassificar a compra depois.
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_materias_primas
  ADD COLUMN IF NOT EXISTS conta_id UUID REFERENCES financeiro_contas(id);

-- Verificação: a coluna deve aparecer na listagem.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_materias_primas'
ORDER BY ordinal_position;
