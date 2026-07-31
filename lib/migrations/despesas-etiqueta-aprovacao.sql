-- Etiqueta de comunicação entre os admins que mexem no financeiro, pra
-- coordenar prioridade de pagamento (ex: "aprovada para pagamento" vs.
-- "planejar pagamento") — não é o workflow de pagamento em si (isso
-- continua sendo `status`), só um recado rápido entre quem decide e quem
-- efetivamente paga no banco. RLS de UPDATE já cobre (qualquer admin edita
-- qualquer lançamento) — não precisa de policy nova.
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS etiqueta_aprovacao TEXT
  CHECK (etiqueta_aprovacao IN ('planejar_pagamento', 'aprovada_pagamento') OR etiqueta_aprovacao IS NULL);

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_lancamentos' AND column_name = 'etiqueta_aprovacao';
