-- ============================================================
-- Orçamento: substitui valor_meta_venda (total mensal único) por meta de
-- venda E previsão de entrada de caixa por dia da semana (loja1/loja2) —
-- cadastro manual, sem cálculo automático por enquanto (falta histórico
-- suficiente; a média histórica pode voltar quando houver ~6 meses de
-- dado real). Índice de dia da semana combina com Date.getDay()
-- (0=domingo..6=sábado), igual DIA_SEMANA_LABEL em
-- components/FluxoMensalTabela.tsx.
--
-- Descarta valor_meta_venda de propósito (confirmado com o usuário) — não
-- faz backfill dividindo por 7, isso recriaria a mesma distribuição plana
-- que este trabalho existe pra substituir. Julho/2026 precisa ser
-- recadastrado na ferramenta nova.
-- ============================================================

ALTER TABLE financeiro_orcamentos DROP CONSTRAINT IF EXISTS fo_meta_e_saldo_so_loja;

ALTER TABLE financeiro_orcamentos
  ADD COLUMN IF NOT EXISTS meta_venda_dom NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_seg NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_ter NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_qua NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_qui NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_sex NUMERIC,
  ADD COLUMN IF NOT EXISTS meta_venda_sab NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_dom NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_seg NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_ter NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_qua NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_qui NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_sex NUMERIC,
  ADD COLUMN IF NOT EXISTS entrada_prevista_sab NUMERIC;

ALTER TABLE financeiro_orcamentos DROP COLUMN IF EXISTS valor_meta_venda;

ALTER TABLE financeiro_orcamentos
  ADD CONSTRAINT fo_meta_venda_positiva CHECK (
    (meta_venda_dom IS NULL OR meta_venda_dom > 0) AND (meta_venda_seg IS NULL OR meta_venda_seg > 0) AND
    (meta_venda_ter IS NULL OR meta_venda_ter > 0) AND (meta_venda_qua IS NULL OR meta_venda_qua > 0) AND
    (meta_venda_qui IS NULL OR meta_venda_qui > 0) AND (meta_venda_sex IS NULL OR meta_venda_sex > 0) AND
    (meta_venda_sab IS NULL OR meta_venda_sab > 0)
  ),
  ADD CONSTRAINT fo_entrada_prevista_positiva CHECK (
    (entrada_prevista_dom IS NULL OR entrada_prevista_dom > 0) AND (entrada_prevista_seg IS NULL OR entrada_prevista_seg > 0) AND
    (entrada_prevista_ter IS NULL OR entrada_prevista_ter > 0) AND (entrada_prevista_qua IS NULL OR entrada_prevista_qua > 0) AND
    (entrada_prevista_qui IS NULL OR entrada_prevista_qui > 0) AND (entrada_prevista_sex IS NULL OR entrada_prevista_sex > 0) AND
    (entrada_prevista_sab IS NULL OR entrada_prevista_sab > 0)
  );

ALTER TABLE financeiro_orcamentos
  ADD CONSTRAINT fo_meta_e_saldo_so_loja CHECK (
    unidade <> 'geral' OR (
      saldo_inicial IS NULL AND
      meta_venda_dom IS NULL AND meta_venda_seg IS NULL AND meta_venda_ter IS NULL AND
      meta_venda_qua IS NULL AND meta_venda_qui IS NULL AND meta_venda_sex IS NULL AND meta_venda_sab IS NULL AND
      entrada_prevista_dom IS NULL AND entrada_prevista_seg IS NULL AND entrada_prevista_ter IS NULL AND
      entrada_prevista_qua IS NULL AND entrada_prevista_qui IS NULL AND entrada_prevista_sex IS NULL AND entrada_prevista_sab IS NULL
    )
  );

-- Verificação
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'financeiro_orcamentos' ORDER BY ordinal_position;
