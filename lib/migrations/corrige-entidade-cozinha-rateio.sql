-- Corrige a dimensão `unidade` do Financeiro: a cozinha não é uma 4ª
-- entidade — o plano de contas real só tem 3 (0116=Paraisópolis,
-- 0205=Itajubá, 0001=Rateio), e os custos da cozinha entram como rateio,
-- já que não são atribuídos a uma loja específica.
-- Execute no Supabase SQL Editor.

-- 1. Migra qualquer lançamento/recorrência já gravado com unidade='cozinha'.
UPDATE financeiro_lancamentos SET unidade = 'rateio' WHERE unidade = 'cozinha';
UPDATE financeiro_recorrencias SET unidade = 'rateio' WHERE unidade = 'cozinha';

-- 2. Restringe o CHECK às 3 entidades reais (nomes padrão do Postgres para
--    constraint sem nome explícito: <tabela>_<coluna>_check).
ALTER TABLE financeiro_lancamentos DROP CONSTRAINT IF EXISTS financeiro_lancamentos_unidade_check;
ALTER TABLE financeiro_lancamentos ADD CONSTRAINT financeiro_lancamentos_unidade_check CHECK (unidade IN ('loja1', 'loja2', 'rateio'));

ALTER TABLE financeiro_recorrencias DROP CONSTRAINT IF EXISTS financeiro_recorrencias_unidade_check;
ALTER TABLE financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_unidade_check CHECK (unidade IN ('loja1', 'loja2', 'rateio'));

-- 3. Usuário com role='cozinha' agora tem sua unidade travada em 'rateio'.
CREATE OR REPLACE FUNCTION financeiro_unidade_do_usuario() RETURNS TEXT AS $$
  SELECT CASE
    WHEN role = 'cozinha' THEN 'rateio'
    WHEN role = 'loja' THEN loja_id
    ELSE NULL
  END
  FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verificação: nenhuma linha deve restar com unidade='cozinha', e o CHECK
-- novo deve rejeitar esse valor (teste manual: tentar inserir 'cozinha' deve falhar).
SELECT unidade, count(*) FROM financeiro_lancamentos GROUP BY unidade
UNION ALL
SELECT unidade, count(*) FROM financeiro_recorrencias GROUP BY unidade;
