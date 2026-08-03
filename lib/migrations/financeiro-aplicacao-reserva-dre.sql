-- Aplicação financeira / reservas (13º, férias, ativo fixo etc.) não são
-- despesa real — é caixa mudando de "bolso" dentro do próprio patrimônio.
-- Sem classificação própria, a transferência mensal pra essa reserva conta
-- como despesa no DRE e o resgate posterior conta como receita, distorcendo
-- o resultado do mês. Generaliza pra qualquer conta com esse papel (não só
-- 3002), via um flag na conta em vez de um novo tipo de lançamento.

-- 1. Conta de reserva não entra no DRE como despesa quando afeta_dre=false.
ALTER TABLE financeiro_contas ADD COLUMN IF NOT EXISTS afeta_dre BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN financeiro_contas.afeta_dre IS
  'false = conta de reserva/provisão (aplicação financeira, ativo fixo etc.) — aportes lançados nela não entram no DRE como despesa, só saem do caixa disponível.';

UPDATE financeiro_contas SET afeta_dre = false WHERE codigo = '3002';

-- 2. Resgate de uma dessas reservas: nova categoria de receita, excluída da
--    Receita Bruta (não é venda), com a conta de origem pra rastrear saldo.
ALTER TABLE financeiro_receitas ADD COLUMN IF NOT EXISTS conta_id UUID REFERENCES financeiro_contas(id);
COMMENT ON COLUMN financeiro_receitas.conta_id IS
  'Só preenchido quando categoria=resgate_aplicacao — de qual conta de reserva (afeta_dre=false) veio o resgate.';

DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'financeiro_receitas'::regclass
    AND contype = 'c'
    AND (pg_get_constraintdef(oid) ILIKE '%categoria = ANY%' OR pg_get_constraintdef(oid) ILIKE '%categoria IN%');
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE financeiro_receitas DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE financeiro_receitas ADD CONSTRAINT financeiro_receitas_categoria_check
  CHECK (categoria IN ('venda_cartao', 'pix', 'dinheiro', 'repasse_ifood', 'repasse_aiqfome', 'outros', 'resgate_aplicacao'));

ALTER TABLE financeiro_receitas DROP CONSTRAINT IF EXISTS fr_resgate_conta_check;
ALTER TABLE financeiro_receitas ADD CONSTRAINT fr_resgate_conta_check CHECK (
  (categoria = 'resgate_aplicacao' AND conta_id IS NOT NULL) OR
  (categoria <> 'resgate_aplicacao' AND conta_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_fr_conta ON financeiro_receitas(conta_id) WHERE conta_id IS NOT NULL;

-- Verificação
SELECT codigo, nome, afeta_dre FROM financeiro_contas WHERE afeta_dre = false;
