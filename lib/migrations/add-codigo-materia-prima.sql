-- ============================================================
-- Módulo Financeiro — CMV (código auto-gerado p/ matéria-prima)
--
-- Base pra hierarquia de custo (matéria-prima → pré-preparo → produto
-- final, ver criar-financeiro-cmv.sql). Código sequencial, não editável
-- pelo usuário — só existe pra referência/organização (e cruzamento
-- futuro com código de fornecedor).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS financeiro_mp_codigo_seq;

ALTER TABLE financeiro_materias_primas
  ADD COLUMN IF NOT EXISTS codigo TEXT UNIQUE
  DEFAULT ('MP-' || LPAD(nextval('financeiro_mp_codigo_seq')::text, 4, '0'));

ALTER SEQUENCE financeiro_mp_codigo_seq OWNED BY financeiro_materias_primas.codigo;

-- Backfill determinístico (ordem de criação) das linhas existentes —
-- nextval() dentro de um UPDATE em massa não garante ordem, por isso
-- row_number() sobre um ORDER BY estável em vez disso.
WITH numerados AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM financeiro_materias_primas WHERE codigo IS NULL
)
UPDATE financeiro_materias_primas mp
SET codigo = 'MP-' || LPAD(numerados.rn::text, 4, '0')
FROM numerados WHERE mp.id = numerados.id;

-- Garante que a sequence continua depois do backfill (senão o próximo
-- INSERT tentaria gerar um código que o backfill já usou).
SELECT setval('financeiro_mp_codigo_seq', (SELECT count(*) FROM financeiro_materias_primas));

ALTER TABLE financeiro_materias_primas ALTER COLUMN codigo SET NOT NULL;
GRANT USAGE ON SEQUENCE financeiro_mp_codigo_seq TO authenticated;

-- Verificação
SELECT codigo, nome FROM financeiro_materias_primas ORDER BY codigo LIMIT 10;
SELECT count(*) AS sem_codigo FROM financeiro_materias_primas WHERE codigo IS NULL;
