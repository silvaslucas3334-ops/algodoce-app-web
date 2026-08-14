-- ============================================================
-- DRE em cascata — mapeamento conta -> linha da cascata
--
-- grupo_dre (texto livre, já existente) continua servindo pra agrupar a
-- exibição de Plano de Contas e do editor de Orçamento — não é tocado.
-- linha_dre é uma classificação nova, restrita a um conjunto fixo de
-- seções da cascata (Receita Líquida -> Lucro Bruto -> Resultado
-- Operacional -> Resultado Financeiro -> Lucro Líquido), pra alimentar o
-- DRE reestruturado sem misturar com o agrupamento livre que já existia.
--
-- Nullable de propósito: conta nova sem classificação cai num balde "Não
-- classificado" na tela em vez de sumir silenciosamente do resultado.
-- ============================================================

ALTER TABLE financeiro_contas ADD COLUMN IF NOT EXISTS linha_dre TEXT;

ALTER TABLE financeiro_contas DROP CONSTRAINT IF EXISTS financeiro_contas_linha_dre_check;
ALTER TABLE financeiro_contas ADD CONSTRAINT financeiro_contas_linha_dre_check
  CHECK (linha_dre IS NULL OR linha_dre IN
    ('deducao_vendas', 'cmv', 'mao_obra_encargos', 'despesas_operacionais', 'resultado_financeiro', 'distribuicao_lucros'));

UPDATE financeiro_contas SET linha_dre = 'cmv'                   WHERE codigo IN ('1001', '1002', '1004');
UPDATE financeiro_contas SET linha_dre = 'mao_obra_encargos'     WHERE codigo IN ('1003', '1005');
UPDATE financeiro_contas SET linha_dre = 'despesas_operacionais' WHERE codigo IN ('1006', '1007', '2002', '2006', '3006');
UPDATE financeiro_contas SET linha_dre = 'deducao_vendas'        WHERE codigo IN ('2001', '2003', '2004', '2005');
UPDATE financeiro_contas SET linha_dre = 'resultado_financeiro'  WHERE codigo IN ('3001', '3002', '3003', '3005');
UPDATE financeiro_contas SET linha_dre = 'distribuicao_lucros'   WHERE codigo = '3004';

-- Verificação
SELECT codigo, nome, grupo_dre, linha_dre, afeta_dre FROM financeiro_contas ORDER BY codigo;
