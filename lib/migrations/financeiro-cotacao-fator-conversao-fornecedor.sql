-- Cada fornecedor pode embalar o mesmo item de forma diferente (ex: caixa de
-- P630 do Zacheu = 300 un, caixa do Dant = 100 un). Comparar "valor por cx"
-- direto entre os dois é enganoso. fator_conversao_fornecedor deixa quem
-- responde a cotação (o admin, digitando o que o fornecedor cotou) informar
-- a conversão REAL daquele fornecedor pra unidade_medida (a "unidade
-- primária"), sobrescrevendo o padrão cadastrado na matéria-prima só quando
-- necessário — a comparação passa a normalizar por essa unidade.

ALTER TABLE financeiro_cotacao_precos
  ADD COLUMN IF NOT EXISTS fator_conversao_fornecedor NUMERIC CHECK (fator_conversao_fornecedor IS NULL OR fator_conversao_fornecedor > 0);
COMMENT ON COLUMN financeiro_cotacao_precos.fator_conversao_fornecedor IS
  'unidade_medida por 1 unidade_cotacao, conforme ESSE fornecedor — só preenchido quando a embalagem dele difere do padrão cadastrado em financeiro_materias_primas.fator_conversao (ex: caixa com menos unidades). NULL = usa o padrão da matéria-prima.';

CREATE OR REPLACE FUNCTION financeiro_cotacao_responder(
  p_cotacao_fornecedor_id UUID,
  p_precos JSONB
) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) NOT IN ('admin', 'loja', 'cozinha') THEN
    RAISE EXCEPTION 'apenas usuário autenticado do sistema pode responder cotações';
  END IF;

  INSERT INTO financeiro_cotacao_precos (cotacao_item_id, cotacao_fornecedor_id, valor_unitario, valor_total, disponivel, fator_conversao_fornecedor)
  SELECT
    (x->>'cotacao_item_id')::UUID,
    p_cotacao_fornecedor_id,
    (x->>'valor_unitario')::NUMERIC,
    (x->>'valor_total')::NUMERIC,
    (x->>'disponivel')::BOOLEAN,
    (x->>'fator_conversao_fornecedor')::NUMERIC
  FROM jsonb_array_elements(p_precos) AS x
  ON CONFLICT (cotacao_item_id, cotacao_fornecedor_id)
  DO UPDATE SET
    valor_unitario = EXCLUDED.valor_unitario,
    valor_total = EXCLUDED.valor_total,
    disponivel = EXCLUDED.disponivel,
    fator_conversao_fornecedor = EXCLUDED.fator_conversao_fornecedor;

  UPDATE financeiro_cotacao_fornecedores
  SET status = 'respondido', respondido_em = now()
  WHERE id = p_cotacao_fornecedor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_cotacao_responder TO authenticated;
