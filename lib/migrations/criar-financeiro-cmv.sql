-- ============================================================
-- Módulo Financeiro — CMV / Ficha Técnica
--
-- Hierarquia de custo: matéria-prima (+ embalagem) → pré-preparo →
-- produto final. Sem aninhamento (pré-preparo só usa matéria-prima —
-- garantido pela própria estrutura, não por CHECK: a tabela de itens do
-- pré-preparo nem tem coluna pra apontar pra outro pré-preparo).
-- Produto final combina matéria-prima e/ou pré-preparo livremente, e
-- pode ser vendido porcionado (rendimento_porcoes).
--
-- RLS admin-only até pra SELECT nas 4 tabelas — é dado de margem/custo,
-- mesmo tratamento já dado a financeiro_cotacoes (preço de fornecedor).
--
-- As duas tabelas de itens (_itens) NÃO têm policy de INSERT/UPDATE/
-- DELETE — diferente de nota fiscal/cotação (registros congelados depois
-- de criados), uma ficha técnica precisa ser editável (trocar
-- ingrediente, remover linha), e toda tabela deste schema tem DELETE
-- bloqueado por design. Resolvido do mesmo jeito que
-- financeiro_pdv_substituir_periodo: uma função SECURITY DEFINER que
-- apaga e reinsere o conjunto inteiro de linhas de uma vez só. Cadastrar
-- e editar chamam a mesma função — sem lógica divergente entre os dois.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS financeiro_pp_codigo_seq;
GRANT USAGE ON SEQUENCE financeiro_pp_codigo_seq TO authenticated;

CREATE TABLE IF NOT EXISTS financeiro_pre_preparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL DEFAULT ('PP-' || LPAD(nextval('financeiro_pp_codigo_seq')::text, 4, '0')),
  nome TEXT NOT NULL UNIQUE,
  unidade_medida TEXT NOT NULL, -- unidade do rendimento e do consumo quando usado num produto final, ex: 'g'
  rendimento_quantidade NUMERIC NOT NULL CHECK (rendimento_quantidade > 0), -- quanto a receita rende, em unidade_medida
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
DO $$ BEGIN
  ALTER SEQUENCE financeiro_pp_codigo_seq OWNED BY financeiro_pre_preparos.codigo;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS financeiro_pre_preparo_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_preparo_id UUID NOT NULL REFERENCES financeiro_pre_preparos(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0), -- na unidade_medida da matéria-prima
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pre_preparo_id, materia_prima_id)
);
CREATE INDEX IF NOT EXISTS idx_fppi_pre_preparo ON financeiro_pre_preparo_itens(pre_preparo_id);
CREATE INDEX IF NOT EXISTS idx_fppi_materia_prima ON financeiro_pre_preparo_itens(materia_prima_id);

CREATE TABLE IF NOT EXISTS financeiro_produtos_finais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  codigo_pdv_loja1 TEXT, -- código do cadastro de produtos do PDV (Paraisópolis) — manual por enquanto
  codigo_pdv_loja2 TEXT, -- idem, Itajubá — cada loja numera seu PDV de forma independente
  rendimento_porcoes INT NOT NULL DEFAULT 1 CHECK (rendimento_porcoes > 0),
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpf_codigo_pdv_loja1 ON financeiro_produtos_finais(codigo_pdv_loja1) WHERE codigo_pdv_loja1 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpf_codigo_pdv_loja2 ON financeiro_produtos_finais(codigo_pdv_loja2) WHERE codigo_pdv_loja2 IS NOT NULL;

CREATE TABLE IF NOT EXISTS financeiro_produto_final_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_final_id UUID NOT NULL REFERENCES financeiro_produtos_finais(id) ON DELETE CASCADE,
  materia_prima_id UUID REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  pre_preparo_id UUID REFERENCES financeiro_pre_preparos(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (num_nonnulls(materia_prima_id, pre_preparo_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_fpfi_produto_final ON financeiro_produto_final_itens(produto_final_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_materia_prima ON financeiro_produto_final_itens(materia_prima_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_pre_preparo ON financeiro_produto_final_itens(pre_preparo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_mp ON financeiro_produto_final_itens(produto_final_id, materia_prima_id) WHERE materia_prima_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_pp ON financeiro_produto_final_itens(produto_final_id, pre_preparo_id) WHERE pre_preparo_id IS NOT NULL;

ALTER TABLE financeiro_pre_preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_pre_preparo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produtos_finais ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produto_final_itens ENABLE ROW LEVEL SECURITY;

-- financeiro_pre_preparos: cadastro normal admin-only.
DROP POLICY IF EXISTS financeiro_pre_preparos_select ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_select ON financeiro_pre_preparos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pre_preparos_insert ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_insert ON financeiro_pre_preparos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_pre_preparos_update ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_update ON financeiro_pre_preparos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos FOR DELETE USING (false);

-- financeiro_produtos_finais: mesmo padrão.
DROP POLICY IF EXISTS financeiro_produtos_finais_select ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_select ON financeiro_produtos_finais FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produtos_finais_insert ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_insert ON financeiro_produtos_finais FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_produtos_finais_update ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_update ON financeiro_produtos_finais FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais FOR DELETE USING (false);

-- _itens: só SELECT admin-only — toda escrita passa pelas funções abaixo.
DROP POLICY IF EXISTS financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens;
CREATE POLICY financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produto_final_itens_select ON financeiro_produto_final_itens;
CREATE POLICY financeiro_produto_final_itens_select ON financeiro_produto_final_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

-- Substituição atômica das linhas — mesmo padrão de
-- financeiro_pdv_substituir_periodo. Cadastrar (parent ainda sem linha
-- nenhuma) e editar (parent já tem linhas) chamam a mesma função.
CREATE OR REPLACE FUNCTION financeiro_pre_preparo_salvar_itens(p_pre_preparo_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar receitas';
  END IF;
  DELETE FROM financeiro_pre_preparo_itens WHERE pre_preparo_id = p_pre_preparo_id;
  INSERT INTO financeiro_pre_preparo_itens (pre_preparo_id, materia_prima_id, quantidade)
  SELECT p_pre_preparo_id, (i->>'materia_prima_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_pre_preparo_salvar_itens TO authenticated;

CREATE OR REPLACE FUNCTION financeiro_produto_final_salvar_itens(p_produto_final_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar receitas';
  END IF;
  DELETE FROM financeiro_produto_final_itens WHERE produto_final_id = p_produto_final_id;
  INSERT INTO financeiro_produto_final_itens (produto_final_id, materia_prima_id, pre_preparo_id, quantidade)
  SELECT p_produto_final_id, (i->>'materia_prima_id')::UUID, (i->>'pre_preparo_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_produto_final_salvar_itens TO authenticated;

-- Verificação
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('financeiro_pre_preparos', 'financeiro_pre_preparo_itens', 'financeiro_produtos_finais', 'financeiro_produto_final_itens');
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('financeiro_pre_preparo_salvar_itens', 'financeiro_produto_final_salvar_itens');
