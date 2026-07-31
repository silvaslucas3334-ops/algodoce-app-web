-- Cozinha ganha acesso à Ficha Técnica (pré-preparos e produtos finais):
-- consegue ver tudo (inclusive custo/margem — aceito conscientemente, sem
-- isso o módulo fica inutilizável pra montar receita nova referenciando
-- pré-preparos/insumos existentes) e criar/editar registros, mas o que a
-- cozinha cria nasce 'pendente_revisao' até um admin aprovar. Admin
-- continua criando direto como 'aprovado', sem esse passo extra.
-- Execute no Supabase SQL Editor.

-- 1. Coluna de status nas duas tabelas-pai (não nas de itens)
ALTER TABLE financeiro_pre_preparos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('aprovado', 'pendente_revisao'));
ALTER TABLE financeiro_produtos_finais
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('aprovado', 'pendente_revisao'));

-- 2. SELECT liberado pra admin + cozinha nas 4 tabelas
DROP POLICY IF EXISTS financeiro_pre_preparos_select ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_select ON financeiro_pre_preparos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

DROP POLICY IF EXISTS financeiro_produtos_finais_select ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_select ON financeiro_produtos_finais FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

DROP POLICY IF EXISTS financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens;
CREATE POLICY financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

DROP POLICY IF EXISTS financeiro_produto_final_itens_select ON financeiro_produto_final_itens;
CREATE POLICY financeiro_produto_final_itens_select ON financeiro_produto_final_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

-- 3. INSERT: cozinha só com status='pendente_revisao'; admin qualquer status
DROP POLICY IF EXISTS financeiro_pre_preparos_insert ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_insert ON financeiro_pre_preparos FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
    )
  );

DROP POLICY IF EXISTS financeiro_produtos_finais_insert ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_insert ON financeiro_produtos_finais FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
    )
  );

-- 4. UPDATE: admin edita/aprova qualquer linha; cozinha só linhas ainda
--    pendente_revisao — time compartilhado, sem trava por criador (mesmo
--    padrão de financeiro_orcamentos_update).
DROP POLICY IF EXISTS financeiro_pre_preparos_update ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_update ON financeiro_pre_preparos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  );

DROP POLICY IF EXISTS financeiro_produtos_finais_update ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_update ON financeiro_produtos_finais FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  );

-- 5. Funções SECURITY DEFINER que salvam os itens: aceitar cozinha,
--    travada por status da linha pai (só mexe em itens de algo ainda
--    pendente de revisão).
CREATE OR REPLACE FUNCTION financeiro_pre_preparo_salvar_itens(p_pre_preparo_id UUID, p_itens JSONB) RETURNS void AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT role INTO v_role FROM usuarios WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'cozinha') THEN
    RAISE EXCEPTION 'apenas admin ou cozinha pode editar receitas';
  END IF;
  IF v_role = 'cozinha' THEN
    SELECT status INTO v_status FROM financeiro_pre_preparos WHERE id = p_pre_preparo_id;
    IF v_status IS DISTINCT FROM 'pendente_revisao' THEN
      RAISE EXCEPTION 'cozinha só pode editar itens de pré-preparo pendente de revisão';
    END IF;
  END IF;
  DELETE FROM financeiro_pre_preparo_itens WHERE pre_preparo_id = p_pre_preparo_id;
  INSERT INTO financeiro_pre_preparo_itens (pre_preparo_id, materia_prima_id, quantidade)
  SELECT p_pre_preparo_id, (i->>'materia_prima_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_pre_preparo_salvar_itens TO authenticated;

CREATE OR REPLACE FUNCTION financeiro_produto_final_salvar_itens(p_produto_final_id UUID, p_itens JSONB) RETURNS void AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT role INTO v_role FROM usuarios WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'cozinha') THEN
    RAISE EXCEPTION 'apenas admin ou cozinha pode editar receitas';
  END IF;
  IF v_role = 'cozinha' THEN
    SELECT status INTO v_status FROM financeiro_produtos_finais WHERE id = p_produto_final_id;
    IF v_status IS DISTINCT FROM 'pendente_revisao' THEN
      RAISE EXCEPTION 'cozinha só pode editar itens de produto final pendente de revisão';
    END IF;
  END IF;
  DELETE FROM financeiro_produto_final_itens WHERE produto_final_id = p_produto_final_id;
  INSERT INTO financeiro_produto_final_itens (produto_final_id, materia_prima_id, pre_preparo_id, quantidade)
  SELECT p_produto_final_id, (i->>'materia_prima_id')::UUID, (i->>'pre_preparo_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_produto_final_salvar_itens TO authenticated;

-- Verificação
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('financeiro_pre_preparos', 'financeiro_produtos_finais') AND column_name = 'status';
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename LIKE 'financeiro_pre_preparo%' OR tablename LIKE 'financeiro_produto_final%'
ORDER BY tablename, cmd;
