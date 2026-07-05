-- Adicionar status 'em_estoque' ao constraint de romaneios
-- Execute no Supabase SQL Editor

ALTER TABLE romaneios
DROP CONSTRAINT IF EXISTS romaneios_status_check;

ALTER TABLE romaneios
ADD CONSTRAINT romaneios_status_check
CHECK (status IN ('rascunho', 'confirmado', 'em_estoque', 'cancelado'));

-- Verificar que o constraint foi criado
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'romaneios' AND constraint_name = 'romaneios_status_check';
