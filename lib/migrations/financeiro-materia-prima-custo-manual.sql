-- Custo manual por unidade_compra para matérias-primas sem histórico de
-- compra no sistema (ex: sal, azeite comprados antes desse módulo existir).
-- Presença (IS NOT NULL) é o próprio toggle — liga/desliga sem coluna
-- booleana separada. Preenchido na MESMA unidade que o usuário já pensa ao
-- lançar uma compra real (unidade_compra, ex: "R$ por kg"), convertido
-- internamente via fator_conversao pra custo por unidade_medida — espelha
-- exatamente como financeiro_lancamento_itens.valor_unitario já funciona.
-- Quando preenchido, SEMPRE tem prioridade sobre o custo calculado (ver
-- lib/financeiro-cmv.ts, buscarCustosAtuaisMateriasPrimas) — nunca troca
-- de volta sozinho quando compras reais começam a chegar; o usuário limpa
-- o campo manualmente quando quiser voltar ao cálculo automático.

ALTER TABLE financeiro_materias_primas ADD COLUMN IF NOT EXISTS custo_manual_por_unidade_compra NUMERIC;

ALTER TABLE financeiro_materias_primas DROP CONSTRAINT IF EXISTS fmp_custo_manual_nao_negativo;
ALTER TABLE financeiro_materias_primas ADD CONSTRAINT fmp_custo_manual_nao_negativo
  CHECK (custo_manual_por_unidade_compra IS NULL OR custo_manual_por_unidade_compra >= 0);
