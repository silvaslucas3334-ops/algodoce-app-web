-- ============================================================
-- Orçamento: dia da semana opcional nos itens de despesa variável.
-- Alguns fornecedores têm um padrão semanal previsível (ex: boleto pago
-- toda segunda) — cadastrar isso como "por dia da semana" em vez de um
-- valor único do mês deixa o previsto mais fácil de cadastrar E mais
-- preciso (o total do mês é calculado automaticamente pela quantidade de
-- ocorrências daquele dia, não chutado). Índice 0=domingo..6=sábado,
-- igual DIA_SEMANA_LABEL em components/FluxoMensalTabela.tsx.
--
-- Item sem dia_semana continua funcionando como antes — valor único pro
-- mês inteiro, pra despesas variáveis sem padrão semanal (ex: uma compra
-- avulsa de embalagem).
--
-- Este valor NÃO entra na linha real de Saídas do calendário (só na
-- comparação orçado x realizado) — misturar um "chute recorrente" com
-- notas/boletos já lançados de verdade duplicaria o valor quando os dois
-- coexistirem no mesmo mês.
-- ============================================================

ALTER TABLE financeiro_orcamento_itens
  ADD COLUMN IF NOT EXISTS dia_semana INT CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6);

CREATE OR REPLACE FUNCTION financeiro_orcamento_salvar_itens(p_orcamento_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar orçamento';
  END IF;
  DELETE FROM financeiro_orcamento_itens WHERE orcamento_id = p_orcamento_id;
  INSERT INTO financeiro_orcamento_itens (orcamento_id, tipo, parte_id, conta_id, valor_previsto, dia_semana, observacao)
  SELECT p_orcamento_id, i->>'tipo', (i->>'parte_id')::UUID, (i->>'conta_id')::UUID, (i->>'valor_previsto')::NUMERIC, (i->>'dia_semana')::INT, i->>'observacao'
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_orcamento_salvar_itens TO authenticated;

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_orcamento_itens' ORDER BY ordinal_position;
