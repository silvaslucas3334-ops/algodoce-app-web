-- financeiro_pdv_pedidos.tot_itens estava tipado como INT, mas "Tot. Itens"
-- no export do PDV é o VALOR (subtotal dos itens antes de ajustes), não uma
-- contagem — o nome da coluna no PDV engana. Confirmado com erro real:
-- "invalid input syntax for type integer: 46.99".
-- Execute no Supabase SQL Editor.

ALTER TABLE financeiro_pdv_pedidos ALTER COLUMN tot_itens TYPE NUMERIC;

-- Recria a function com o tipo corrigido no jsonb_to_recordset.
CREATE OR REPLACE FUNCTION financeiro_pdv_substituir_periodo(
  p_unidade TEXT,
  p_data_min DATE,
  p_data_max DATE,
  p_pedidos JSONB,
  p_itens JSONB,
  p_importado_por UUID
) RETURNS JSONB AS $$
DECLARE
  v_removidos INT;
  v_ins_pedidos INT;
  v_ins_itens INT;
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode importar/substituir períodos do PDV';
  END IF;

  DELETE FROM financeiro_pdv_pedidos
  WHERE unidade = p_unidade
    AND data_abertura::date BETWEEN p_data_min AND p_data_max;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  WITH ins_pedidos AS (
    INSERT INTO financeiro_pdv_pedidos (
      unidade, codigo, data_abertura, data_fechamento, status, tot_itens,
      servico, desconto, valor_entrega, total, total_recebido, forma_pagamento,
      nota_emitida, serie_nf, numero_nf, importado_por
    )
    SELECT p_unidade, x.codigo, x.data_abertura, x.data_fechamento, x.status, x.tot_itens,
           x.servico, x.desconto, x.valor_entrega, x.total, x.total_recebido, x.forma_pagamento,
           x.nota_emitida, x.serie_nf, x.numero_nf, p_importado_por
    FROM jsonb_to_recordset(p_pedidos) AS x(
      codigo TEXT, data_abertura TIMESTAMPTZ, data_fechamento TIMESTAMPTZ, status TEXT,
      tot_itens NUMERIC, servico NUMERIC, desconto NUMERIC, valor_entrega NUMERIC, total NUMERIC,
      total_recebido NUMERIC, forma_pagamento TEXT, nota_emitida BOOLEAN, serie_nf TEXT, numero_nf TEXT
    )
    RETURNING id, codigo
  ),
  ins_itens AS (
    INSERT INTO financeiro_pdv_itens (
      pedido_id, ordem_pedido, data_hora_item, quantidade, valor_unitario,
      valor_total_item, tipo_item, nome_produto, tipo_produto, categoria_produto, codigo_produto_pdv
    )
    SELECT ip.id, y.ordem_pedido, y.data_hora_item, y.quantidade, y.valor_unitario,
           y.valor_total_item, y.tipo_item, y.nome_produto, y.tipo_produto, y.categoria_produto, y.codigo_produto_pdv
    FROM jsonb_to_recordset(p_itens) AS y(
      cod_ped TEXT, ordem_pedido INT, data_hora_item TIMESTAMPTZ, quantidade NUMERIC,
      valor_unitario NUMERIC, valor_total_item NUMERIC, tipo_item TEXT, nome_produto TEXT,
      tipo_produto TEXT, categoria_produto TEXT, codigo_produto_pdv TEXT
    )
    JOIN ins_pedidos ip ON ip.codigo = y.cod_ped
    RETURNING id
  )
  SELECT (SELECT count(*) FROM ins_pedidos), (SELECT count(*) FROM ins_itens)
  INTO v_ins_pedidos, v_ins_itens;

  RETURN jsonb_build_object(
    'pedidos_removidos', v_removidos,
    'pedidos_inseridos', v_ins_pedidos,
    'itens_inseridos', v_ins_itens
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificação: tipo da coluna deve ser "numeric".
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_pdv_pedidos' AND column_name = 'tot_itens';
