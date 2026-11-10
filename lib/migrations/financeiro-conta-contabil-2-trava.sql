-- Conta contábil obrigatória — PASSO 2: TRAVA NO BANCO (10/11/2026)
--
-- RODE SÓ DEPOIS do passo 1 (financeiro-conta-contabil-1-limpeza.sql) devolver "0 | 0" na verificação.
-- Com isto o banco passa a RECUSAR:
--   * item de nota de insumos sem conta (financeiro_lancamento_itens.conta_id vira NOT NULL);
--   * matéria-prima ATIVA sem conta (CHECK: ativo = false OR conta_id IS NOT NULL). Matéria-prima inativa
--     pode ficar sem conta — não entra em compra nova.
-- Despesas comuns já tinham a trava (fl_conta_obrigatoria_despesa); com isso o DRE não tem mais de onde
-- receber valor "sem conta contábil".
--
-- O front (nota de insumos, cadastro de matéria-prima nova/edição, cadastro rápido e edição de item da
-- despesa) já exige a conta antes de gravar, então o usuário vê uma mensagem clara em vez de um erro do banco.
-- Se o banco ainda estiver com o front antigo, a trava só mostrará um erro técnico ao criar matéria-prima sem
-- conta — publique o front junto.
--
-- Seguro rodar mais de uma vez. Execute no Supabase SQL Editor.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM financeiro_lancamento_itens WHERE conta_id IS NULL) THEN
    RAISE EXCEPTION 'Ainda há itens de nota sem conta contábil — rode antes o passo 1 (limpeza). Nada foi alterado.';
  END IF;
  IF EXISTS (SELECT 1 FROM financeiro_materias_primas WHERE ativo AND conta_id IS NULL) THEN
    RAISE EXCEPTION 'Ainda há matérias-primas ativas sem conta contábil — rode antes o passo 1 (limpeza). Nada foi alterado.';
  END IF;
END $$;

ALTER TABLE financeiro_lancamento_itens ALTER COLUMN conta_id SET NOT NULL;

ALTER TABLE financeiro_materias_primas DROP CONSTRAINT IF EXISTS fmp_conta_obrigatoria_ativa;
ALTER TABLE financeiro_materias_primas
  ADD CONSTRAINT fmp_conta_obrigatoria_ativa CHECK (ativo = false OR conta_id IS NOT NULL);

COMMIT;

-- VERIFICAÇÃO — esperado: itens.is_nullable = NO e a constraint listada
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'financeiro_lancamento_itens' AND column_name = 'conta_id';

SELECT conname, pg_get_constraintdef(oid) AS regra
FROM pg_constraint
WHERE conname = 'fmp_conta_obrigatoria_ativa';

-- ROLLBACK (só se precisar afrouxar a trava):
-- ALTER TABLE financeiro_lancamento_itens ALTER COLUMN conta_id DROP NOT NULL;
-- ALTER TABLE financeiro_materias_primas DROP CONSTRAINT IF EXISTS fmp_conta_obrigatoria_ativa;
