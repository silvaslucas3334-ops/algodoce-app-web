-- Drop existing constraint
ALTER TABLE romaneios DROP CONSTRAINT IF EXISTS romaneios_unidade_destino_check;

-- Add new constraint that accepts loja1, loja2, and cozinha
ALTER TABLE romaneios ADD CONSTRAINT romaneios_unidade_destino_check
  CHECK (unidade_destino IN ('loja1', 'loja2', 'cozinha') OR unidade_destino IS NULL);
