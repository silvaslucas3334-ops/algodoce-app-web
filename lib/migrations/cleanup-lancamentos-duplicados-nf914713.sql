-- ============================================================
-- Limpeza pontual: os 2 lançamentos duplicados da NF 914713 (MAGLIONI
-- RIBEIRO), criados sem nenhum item por causa do bug de RLS corrigido em
-- fix-rls-insert-itens-nota-paga.sql. Sem item nenhum neles, mais simples
-- apagar os dois e relançar a nota do zero (agora funcionando).
-- ============================================================

-- 1. Confira antes de apagar — espera-se 2 linhas, ambas sem itens
SELECT l.id, l.numero_documento, l.valor_total, l.status, l.data_lancamento,
       (SELECT COUNT(*) FROM financeiro_lancamento_itens WHERE lancamento_id = l.id) AS qtd_itens
FROM financeiro_lancamentos l
WHERE l.numero_documento = '914713' AND l.tipo = 'compra_insumos';

-- 2. Apaga (bypassa o bloqueio de DELETE da API — SQL Editor roda direto)
DELETE FROM financeiro_lancamentos
WHERE numero_documento = '914713' AND tipo = 'compra_insumos'
  AND id NOT IN (SELECT DISTINCT lancamento_id FROM financeiro_lancamento_itens);

-- 3. Confirma que sumiu
SELECT COUNT(*) AS restantes FROM financeiro_lancamentos WHERE numero_documento = '914713' AND tipo = 'compra_insumos';
