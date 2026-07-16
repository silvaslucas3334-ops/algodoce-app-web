-- ============================================================
-- Módulo Financeiro — DRE (regime de competência)
--
-- Duas peças de dado que faltavam pra um DRE correto:
-- A) Competência: a que mês um lançamento pertence economicamente,
--    distinto de quando foi lançado/pago. Resolvido principalmente pela
--    config de recorrência (salário/aluguel), não por um campo sempre
--    visível nos formulários manuais.
-- B) Taxa de cartão/iFood/Aiqfome: nunca aparece como despesa porque é
--    descontada antes do crédito cair no banco. `valor_bruto` opcional em
--    financeiro_receitas permite calcular a taxa como linha sintética só
--    na consulta do DRE — nunca vira lançamento em financeiro_lancamentos
--    (evitaria dupla contagem no Fluxo de Caixa).
-- ============================================================

-- Competência: NOT NULL com default = data_lancamento. Backfill histórico
-- fica sistematicamente aproximado pra despesas recorrentes antigas
-- (salário/aluguel sempre nasceram com data_lancamento = data de
-- pagamento, nunca o mês de referência) — a tela do DRE avisa isso, não
-- tentamos reconstruir retroativamente.
ALTER TABLE financeiro_lancamentos ADD COLUMN IF NOT EXISTS data_competencia DATE;
UPDATE financeiro_lancamentos SET data_competencia = data_lancamento WHERE data_competencia IS NULL;
ALTER TABLE financeiro_lancamentos ALTER COLUMN data_competencia SET NOT NULL;
ALTER TABLE financeiro_lancamentos ALTER COLUMN data_competencia SET DEFAULT CURRENT_DATE;

-- Recorrência: quantos meses a competência fica ATRÁS do mês em que o
-- lançamento é gerado (salário/aluguel pagos depois de usados = 1).
-- Inteiro pequeno, não boolean — evita uma segunda migration se aparecer
-- um caso de deslocamento de 2 meses. 13º salário é um problema diferente
-- (provisão proporcional, conta 3002 já reservada), não é escopo daqui.
ALTER TABLE financeiro_recorrencias ADD COLUMN IF NOT EXISTS competencia_deslocamento_meses INT NOT NULL DEFAULT 0
  CHECK (competencia_deslocamento_meses BETWEEN 0 AND 2);

-- Receitas: valor bruto opcional. NUNCA substitui `valor` (que continua
-- sendo sempre o líquido que bateu no extrato — Fluxo de Caixa e qualquer
-- outra tela que já lê `valor` continuam corretos sem mudança nenhuma).
-- Só o DRE lê valor_bruto, pra calcular a taxa como diferença.
ALTER TABLE financeiro_receitas ADD COLUMN IF NOT EXISTS valor_bruto NUMERIC CHECK (valor_bruto IS NULL OR valor_bruto >= valor);

-- gerar_lancamentos_recorrentes() passa a gravar data_competencia
-- deslocada, além dos campos que já gravava.
CREATE OR REPLACE FUNCTION gerar_lancamentos_recorrentes() RETURNS void AS $$
DECLARE
  rec RECORD;
  hoje_sp DATE;
BEGIN
  hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  FOR rec IN
    SELECT * FROM financeiro_recorrencias WHERE ativa AND proxima_data <= hoje_sp
  LOOP
    INSERT INTO financeiro_lancamentos (
      tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento, data_competencia,
      status, forma_pagamento, condicao_pagamento, unidade, conta_id,
      recorrencia_id, criado_por
    ) VALUES (
      'despesa', rec.parte_id, rec.descricao, rec.valor, rec.proxima_data, rec.proxima_data,
      (date_trunc('month', rec.proxima_data) - (rec.competencia_deslocamento_meses || ' months')::interval)::date,
      'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id,
      rec.id, rec.criado_por
    );

    UPDATE financeiro_recorrencias
    SET proxima_data = (date_trunc('month', rec.proxima_data) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date,
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificação
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name = 'financeiro_lancamentos' AND column_name = 'data_competencia';
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_recorrencias' AND column_name = 'competencia_deslocamento_meses';
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_receitas' AND column_name = 'valor_bruto';
