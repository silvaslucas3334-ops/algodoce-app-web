-- A tela Import do PDV (app/financeiro/pdv/page.tsx) contava os períodos
-- importados buscando TODAS as linhas de financeiro_pdv_pedidos da unidade
-- e agrupando por mês no navegador. O PostgREST corta silenciosamente em
-- 1000 linhas por consulta sem paginação — quando o total da unidade
-- passa de 1000 (ex: 834 + 166 = exatamente 1000), os meses seguintes
-- simplesmente somem da lista, sem erro nenhum aparecer em lugar algum.
--
-- Corrige agrupando no próprio banco: a tela passa a ler só 1 linha por
-- mês (a contagem já pronta), nunca mais afetado pelo limite de linhas
-- por request, não importa quantos pedidos existam.
--
-- security_invoker = true: a view herda a RLS de financeiro_pdv_pedidos
-- (só admin), mesmo padrão de financeiro_custo_medio_mensal.
--
-- Execute no Supabase SQL Editor.

CREATE OR REPLACE VIEW financeiro_pdv_periodos
WITH (security_invoker = true) AS
SELECT
  unidade,
  date_trunc('month', data_periodo)::date AS mes_referencia,
  count(*) AS quantidade
FROM financeiro_pdv_pedidos
GROUP BY unidade, date_trunc('month', data_periodo);

GRANT SELECT ON financeiro_pdv_periodos TO authenticated;
