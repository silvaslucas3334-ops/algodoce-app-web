-- ============================================================
-- Ajusta financeiro_orcamentos criada com a constraint antiga (unidade
-- incluía 'rateio') para o desenho atual (unidade 'geral' — despesas
-- orçadas consolidadas, sem distinção de loja/rateio). Rodar antes de
-- usar o modal de Orçamento se a tabela já existia no banco.
-- ============================================================

-- 1. Reaproveita qualquer orçamento salvo como 'rateio' (versão antiga)
--    como 'geral' — mesmo conceito, nome novo.
UPDATE financeiro_orcamentos SET unidade = 'geral' WHERE unidade = 'rateio';

-- 2. Remove as constraints antigas que ainda mencionam 'rateio' (nomes
--    autogerados pelo Postgres variam, por isso a busca dinâmica).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'financeiro_orcamentos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%rateio%'
  LOOP
    EXECUTE format('ALTER TABLE financeiro_orcamentos DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 3. Recria com 'geral' no lugar de 'rateio'.
ALTER TABLE financeiro_orcamentos
  ADD CONSTRAINT financeiro_orcamentos_unidade_check CHECK (unidade IN ('loja1','loja2','geral')),
  ADD CONSTRAINT fo_meta_e_saldo_so_loja CHECK (unidade <> 'geral' OR (valor_meta_venda IS NULL AND saldo_inicial IS NULL));

-- Verificação
SELECT column_name, check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.constraint_column_usage ccu ON cc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'financeiro_orcamentos';
