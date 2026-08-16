-- ============================================================
-- Hierarquização de Produto Final (combos) — um produto final marcado
-- como "permite_hierarquizacao" pode ser usado como item (componente)
-- dentro de outro produto final, tipo um combo (1x Brownie + 1x
-- Refrigerante). Hierarquia travada em 1 nível por trigger: um combo
-- não pode conter outro combo, e um produto já usado como componente
-- não pode virar combo — evita ciclo e custo calculado errado.
-- ============================================================

ALTER TABLE financeiro_produtos_finais ADD COLUMN IF NOT EXISTS permite_hierarquizacao BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE financeiro_produto_final_itens
  ADD COLUMN IF NOT EXISTS produto_final_componente_id UUID REFERENCES financeiro_produtos_finais(id) ON DELETE RESTRICT;

-- Troca o CHECK de "exatamente 1 entre materia_prima/pre_preparo" pra
-- "exatamente 1 entre os 3" — descobre o nome real da constraint em vez
-- de arriscar um DROP CONSTRAINT com nome errado (mesmo padrão usado em
-- lib/migrations/financeiro-aplicacao-reserva-dre.sql).
DO $$
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'financeiro_produto_final_itens'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%num_nonnulls%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE financeiro_produto_final_itens DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE financeiro_produto_final_itens
  ADD CONSTRAINT financeiro_produto_final_itens_um_tipo_check
  CHECK (num_nonnulls(materia_prima_id, pre_preparo_id, produto_final_componente_id) = 1);

CREATE INDEX IF NOT EXISTS idx_fpfi_produto_final_componente ON financeiro_produto_final_itens(produto_final_componente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_pfc ON financeiro_produto_final_itens(produto_final_id, produto_final_componente_id) WHERE produto_final_componente_id IS NOT NULL;

-- Trigger de validação — roda em QUALQUER insert/update na tabela (não
-- só pela RPC abaixo), então nenhum caminho de escrita consegue burlar
-- a trava de 1 nível.
CREATE OR REPLACE FUNCTION financeiro_valida_hierarquizacao_produto_final() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.produto_final_componente_id IS NOT NULL THEN
    IF NEW.produto_final_componente_id = NEW.produto_final_id THEN
      RAISE EXCEPTION 'um produto final não pode se referenciar como componente de si mesmo';
    END IF;
    IF EXISTS (
      SELECT 1 FROM financeiro_produto_final_itens
      WHERE produto_final_id = NEW.produto_final_componente_id AND produto_final_componente_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'este produto já é um combo — não pode ser usado como componente de outro combo (hierarquia limitada a 1 nível)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM financeiro_produto_final_itens
      WHERE produto_final_componente_id = NEW.produto_final_id
    ) THEN
      RAISE EXCEPTION 'este produto já é componente de um combo — não pode virar um combo também (hierarquia limitada a 1 nível)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_hierarquizacao_produto_final ON financeiro_produto_final_itens;
CREATE TRIGGER trg_valida_hierarquizacao_produto_final
  BEFORE INSERT OR UPDATE ON financeiro_produto_final_itens
  FOR EACH ROW EXECUTE FUNCTION financeiro_valida_hierarquizacao_produto_final();

-- RPC de salvar itens passa a aceitar também produto_final_componente_id.
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
  INSERT INTO financeiro_produto_final_itens (produto_final_id, materia_prima_id, pre_preparo_id, produto_final_componente_id, quantidade)
  SELECT p_produto_final_id, (i->>'materia_prima_id')::UUID, (i->>'pre_preparo_id')::UUID, (i->>'produto_final_componente_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_produto_final_salvar_itens TO authenticated;

-- Verificação
SELECT column_name FROM information_schema.columns WHERE table_name = 'financeiro_produtos_finais' AND column_name = 'permite_hierarquizacao';
SELECT column_name FROM information_schema.columns WHERE table_name = 'financeiro_produto_final_itens' AND column_name = 'produto_final_componente_id';
