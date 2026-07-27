-- Guarda qual loja ('loja1'/'loja2') corresponde a cada conta bancária real,
-- identificada por um "fingerprint" extraído do próprio arquivo OFX (CNPJ do
-- titular quando o banco expõe, senão banco+número da conta — ver
-- lib/ofx.ts, fingerprintOFX). Usado pra avisar o admin quando o toggle
-- "Loja deste extrato" não bate com o que já foi confirmado antes pra
-- aquela conta (ver ConciliarExtratoTab.tsx) — não existe caso legítimo de
-- apagar essa linha: um mapeamento errado se autocorrige via upsert na
-- próxima confirmação manual.
CREATE TABLE IF NOT EXISTS financeiro_ofx_contas_conhecidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  conta_bancaria TEXT NOT NULL,
  bank_id TEXT,
  acct_id TEXT,
  cnpj TEXT,
  aprendido_por UUID NOT NULL REFERENCES usuarios(id),
  aprendido_em TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE financeiro_ofx_contas_conhecidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_select ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_select ON financeiro_ofx_contas_conhecidas FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_insert ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_insert ON financeiro_ofx_contas_conhecidas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_update ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_update ON financeiro_ofx_contas_conhecidas FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_delete_blocked ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_delete_blocked ON financeiro_ofx_contas_conhecidas FOR DELETE USING (false);

-- Verificação
SELECT column_name FROM information_schema.columns WHERE table_name = 'financeiro_ofx_contas_conhecidas';
