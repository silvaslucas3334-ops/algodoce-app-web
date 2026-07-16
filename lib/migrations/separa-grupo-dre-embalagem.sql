-- ============================================================
-- DRE — separa embalagem de matéria-prima em "Custo de Insumos Comprados"
--
-- Embalagem nunca entra na ficha técnica de produto final (regra de
-- disciplina de cadastro, não travada no código) — o custo dela some do
-- DRE inteiramente se não tivesse uma linha própria ali. Como o DRE já
-- agrupa "Custo de Insumos Comprados" dinamicamente por grupo_dre (ver
-- lib/financeiro-dre.ts), basta dar à conta de embalagem um grupo_dre
-- próprio — nenhuma mudança de código é necessária, o agrupamento já
-- reage à nova linha automaticamente.
-- ============================================================

UPDATE financeiro_contas SET grupo_dre = 'Embalagens' WHERE codigo = '1002';

-- Verificação
SELECT codigo, nome, grupo_dre FROM financeiro_contas WHERE codigo IN ('1001', '1002');
