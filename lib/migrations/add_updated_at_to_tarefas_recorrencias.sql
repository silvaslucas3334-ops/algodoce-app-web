-- Migration: Add updated_at column to tarefas_recorrencias
-- Date: 2026-07-04
-- Purpose: Track when recurrences are modified for audit trail

ALTER TABLE tarefas_recorrencias ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Set existing rows to current timestamp
UPDATE tarefas_recorrencias SET updated_at = NOW() WHERE updated_at IS NULL;

-- Make the column non-nullable after backfill
ALTER TABLE tarefas_recorrencias ALTER COLUMN updated_at SET NOT NULL;
