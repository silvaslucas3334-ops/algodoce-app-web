-- Módulo de Precificação: markup (custo -> preço ideal) e margem de
-- contribuição (custo + preço praticado -> quanto sobra). Ver
-- lib/financeiro-precificacao.ts pras fórmulas.
--
-- Config é uma linha só, global — despesas variáveis (cartão, marketplace,
-- imposto) e custos fixos rateados são realidade do negócio como um todo,
-- não fazem sentido variar por produto. Só a margem de lucro alvo varia
-- por produto (override em financeiro_produtos_finais), com fallback pro
-- padrão daqui quando não informada.
--
-- Idempotente — seguro rodar mesmo que já exista em produção.
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS financeiro_config_precificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxa_cartao_pct NUMERIC NOT NULL DEFAULT 0,
  comissao_marketplace_pct NUMERIC NOT NULL DEFAULT 0,
  imposto_venda_pct NUMERIC NOT NULL DEFAULT 0,
  custos_fixos_pct NUMERIC NOT NULL DEFAULT 0,
  margem_lucro_padrao_pct NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO financeiro_config_precificacao (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM financeiro_config_precificacao);

ALTER TABLE financeiro_config_precificacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_config_precificacao_select ON financeiro_config_precificacao;
CREATE POLICY financeiro_config_precificacao_select ON financeiro_config_precificacao
FOR SELECT TO authenticated
USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

DROP POLICY IF EXISTS financeiro_config_precificacao_update ON financeiro_config_precificacao;
CREATE POLICY financeiro_config_precificacao_update ON financeiro_config_precificacao
FOR UPDATE TO authenticated
USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

ALTER TABLE financeiro_produtos_finais
  ADD COLUMN IF NOT EXISTS preco_venda NUMERIC,
  ADD COLUMN IF NOT EXISTS margem_lucro_desejada_pct NUMERIC;

-- Verificação
SELECT * FROM financeiro_config_precificacao;
SELECT column_name FROM information_schema.columns WHERE table_name = 'financeiro_produtos_finais' AND column_name IN ('preco_venda', 'margem_lucro_desejada_pct');
