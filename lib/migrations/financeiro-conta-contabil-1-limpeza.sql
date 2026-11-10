-- Conta contábil obrigatória — PASSO 1: LIMPEZA (10/11/2026)
--
-- CONTEXTO: item de nota de insumos sem conta cai em "Sem conta contábil" no DRE e é subtraído do
-- resultado. Medido em 10/11: 7 matérias-primas ativas sem conta e 18 itens de nota sem conta (17 em notas
-- ativas, R$ 333,78). Decisões do dono:
--   * Amendoim Torrado (MP-0168), Canudo Doce de Leite (MP-0161), Pão Brioche (MP-0172), Frete (MP-0183)
--     → 1001 MATÉRIA-PRIMA
--   * Guardanapo Sache c/500 (MP-0159), Esponja Lã de Aço (MP-0129), Sabão em Barra PCT C/5 (MP-0133)
--     → 1007 DESPESAS DIVERSAS
--
-- O QUE FAZ
--   1) Libera a conta 1007 para matérias-primas (aplicavel_a = 'ambos'): hoje o cadastro de matéria-prima só
--      lista contas "compras_insumos"/"ambos" (1001 e 1002), e 1007 é "despesas_gerais". Continua aparecendo
--      nas despesas gerais.
--   2) Define a conta das 7 matérias-primas (só onde ainda está vazia — nunca sobrescreve uma conta já escolhida).
--   3) Os itens de nota sem conta herdam a conta da matéria-prima (inclui os 6 itens de matérias-primas que já
--      tinham conta, comprados antes de classificar).
-- Tudo numa transação, com guarda: se alguma conta não existir, nada é gravado.
--
-- Execute no Supabase SQL Editor em partes: (1) PRÉVIA, (2) LIMPEZA, (3) VERIFICAÇÃO.
-- Depois rode o passo 2 (financeiro-conta-contabil-2-trava.sql) e publique o front.

-- (1) PRÉVIA — esperado: 7 matérias-primas ativas sem conta; 18 itens sem conta
SELECT
  (SELECT count(*) FROM financeiro_materias_primas WHERE ativo AND conta_id IS NULL) AS mp_ativas_sem_conta,
  (SELECT count(*) FROM financeiro_lancamento_itens WHERE conta_id IS NULL) AS itens_sem_conta;

-- (2) LIMPEZA
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM financeiro_contas WHERE codigo IN ('1001', '1007')) <> 2 THEN
    RAISE EXCEPTION 'Contas 1001 e/ou 1007 não encontradas em financeiro_contas — nada foi alterado.';
  END IF;
END $$;

UPDATE financeiro_contas SET aplicavel_a = 'ambos' WHERE codigo = '1007' AND aplicavel_a <> 'ambos';

UPDATE financeiro_materias_primas m
SET conta_id = c.id, updated_at = now()
FROM financeiro_contas c
WHERE c.codigo = '1001'
  AND m.codigo IN ('MP-0168', 'MP-0161', 'MP-0172', 'MP-0183')
  AND m.conta_id IS NULL;

UPDATE financeiro_materias_primas m
SET conta_id = c.id, updated_at = now()
FROM financeiro_contas c
WHERE c.codigo = '1007'
  AND m.codigo IN ('MP-0159', 'MP-0129', 'MP-0133')
  AND m.conta_id IS NULL;

UPDATE financeiro_lancamento_itens i
SET conta_id = m.conta_id
FROM financeiro_materias_primas m
WHERE i.materia_prima_id = m.id
  AND i.conta_id IS NULL
  AND m.conta_id IS NOT NULL;

COMMIT;

-- (3) VERIFICAÇÃO — esperado: 0 | 0
-- (se "mp_ativas_sem_conta" não for 0, há outra matéria-prima ativa sem conta: classifique no cadastro;
--  se "itens_sem_conta" não for 0, o item é de uma matéria-prima sem conta — mesma solução)
SELECT
  (SELECT count(*) FROM financeiro_materias_primas WHERE ativo AND conta_id IS NULL) AS mp_ativas_sem_conta,
  (SELECT count(*) FROM financeiro_lancamento_itens WHERE conta_id IS NULL) AS itens_sem_conta;

-- Conferência das 7 matérias-primas (deve mostrar 4× 1001 e 3× 1007):
-- SELECT m.codigo, m.nome, c.codigo AS conta FROM financeiro_materias_primas m
-- JOIN financeiro_contas c ON c.id = m.conta_id
-- WHERE m.codigo IN ('MP-0168','MP-0161','MP-0172','MP-0183','MP-0159','MP-0129','MP-0133') ORDER BY m.codigo;

-- ROLLBACK (só se precisar desfazer; a trilha de auditoria dos itens guarda o estado anterior):
-- UPDATE financeiro_materias_primas SET conta_id = NULL, updated_at = now()
--   WHERE codigo IN ('MP-0168','MP-0161','MP-0172','MP-0183','MP-0159','MP-0129','MP-0133');
-- UPDATE financeiro_contas SET aplicavel_a = 'despesas_gerais' WHERE codigo = '1007';
