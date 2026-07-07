-- Permite reverter uma baixa de estoque, mantendo histórico e justificativa
-- Execute no Supabase SQL Editor

ALTER TABLE movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS justificativa text,
  ADD COLUMN IF NOT EXISTS estornado_de uuid REFERENCES movimentacoes_estoque(id);

-- Verificar que as colunas foram criadas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'movimentacoes_estoque'
ORDER BY ordinal_position;
