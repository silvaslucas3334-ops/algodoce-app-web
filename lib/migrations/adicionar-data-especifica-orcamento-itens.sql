-- ============================================================
-- Orçamento: data específica opcional nos itens de despesa variável — a
-- terceira forma de "quando", ao lado de "sem padrão" (valor único do mês)
-- e "por dia da semana" (toda segunda etc). Serve pra previsões pontuais
-- conhecidas com antecedência (ex: "dia 25/07 retirar R$300 de lucro pra
-- contas pessoais"), sem precisar forçar num padrão semanal.
--
-- No máximo um dos dois (dia_semana, data_especifica) pode estar
-- preenchido — os dois juntos não fazem sentido.
-- ============================================================

ALTER TABLE financeiro_orcamento_itens ADD COLUMN IF NOT EXISTS data_especifica DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'foi_dia_ou_data_nao_ambos'
  ) THEN
    ALTER TABLE financeiro_orcamento_itens
      ADD CONSTRAINT foi_dia_ou_data_nao_ambos CHECK (dia_semana IS NULL OR data_especifica IS NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION financeiro_orcamento_salvar_itens(p_orcamento_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar orçamento';
  END IF;
  DELETE FROM financeiro_orcamento_itens WHERE orcamento_id = p_orcamento_id;
  INSERT INTO financeiro_orcamento_itens (orcamento_id, tipo, parte_id, conta_id, valor_previsto, dia_semana, data_especifica, observacao)
  SELECT p_orcamento_id, i->>'tipo', (i->>'parte_id')::UUID, (i->>'conta_id')::UUID, (i->>'valor_previsto')::NUMERIC, (i->>'dia_semana')::INT, (i->>'data_especifica')::DATE, i->>'observacao'
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_orcamento_salvar_itens TO authenticated;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_orcamento_itens' ORDER BY ordinal_position;
