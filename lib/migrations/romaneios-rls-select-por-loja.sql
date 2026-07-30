-- Restringe a leitura de romaneios: uma loja só pode ver romaneios destinados
-- a ela (unidade_destino) ou criados por alguém da própria loja (criado_por).
-- Admin e cozinha continuam vendo tudo (cozinha cria envios pra todas as lojas
-- e recebe devoluções de todas; admin supervisiona tudo).
--
-- Hoje a policy de SELECT em romaneios é "true" pra qualquer autenticado — as
-- telas de Expedição só escondiam romaneios de outras lojas via filtro no
-- cliente (.filter() depois do fetch), o que não é proteção real: qualquer
-- pessoa logada conseguia ler romaneios de outra loja direto pela API. A aba
-- "Histórico" (nova) expôs isso porque lista os romaneios sem esse filtro de
-- unidade. Esta migration fecha o buraco na origem, no banco.
--
-- Execute no Supabase SQL Editor.

-- Remove a(s) policy(ies) de SELECT existente(s) em romaneios, seja qual for o nome
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'romaneios' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON romaneios', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY romaneios_select_por_loja ON romaneios
FOR SELECT TO authenticated
USING (
  (SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha')
  OR unidade_destino = (SELECT loja_id FROM usuarios WHERE id = auth.uid())
  OR criado_por IN (
    SELECT id FROM usuarios
    WHERE loja_id IS NOT NULL
      AND loja_id = (SELECT loja_id FROM usuarios WHERE id = auth.uid())
  )
);

-- Verificação: deve aparecer só 1 policy de SELECT, com o nome acima
SELECT policyname, cmd, qual FROM pg_policies
WHERE tablename = 'romaneios'
ORDER BY cmd;
