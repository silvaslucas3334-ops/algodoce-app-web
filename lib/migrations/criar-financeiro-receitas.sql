-- Fase "Fluxo de Caixa": categoriza as entradas (créditos) do extrato
-- bancário, que hoje ficam paradas pra sempre — só as saídas (débitos) são
-- conciliadas contra financeiro_lancamentos. Tabela separada de
-- financeiro_lancamentos: receita não tem fornecedor/vencimento/status de
-- pagamento, e colocar tudo numa tabela só forçaria RLS condicional por
-- tipo (mesma classe de bug que já mordeu o módulo Tarefas — Storage sem
-- escopo, funcionando só pro admin).
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS financeiro_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2')), -- receita nunca é 'rateio'
  -- Vocabulário de canal de receita — diferente de forma_pagamento (que é
  -- vocabulário de despesa). 'pix'/'dinheiro' existem nos dois enums com
  -- significado diferente: aqui é canal de entrada, lá é forma de pagar
  -- uma despesa.
  categoria TEXT NOT NULL CHECK (categoria IN ('venda_cartao', 'pix', 'dinheiro', 'repasse_ifood', 'repasse_aiqfome', 'outros')),
  data DATE NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  observacao TEXT,
  extrato_transacao_id UUID REFERENCES financeiro_extrato_transacoes(id),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  -- 'dinheiro' nunca aparece no extrato bancário (é lançamento manual); toda
  -- outra categoria precisa ter lastro numa transação real do extrato.
  CONSTRAINT fr_extrato_dinheiro_check CHECK (
    (categoria = 'dinheiro' AND extrato_transacao_id IS NULL) OR
    (categoria <> 'dinheiro' AND extrato_transacao_id IS NOT NULL)
  )
);

-- Uma receita por transação de extrato — impede categorizar a mesma linha
-- duas vezes (segunda linha de defesa além de checar status_conciliacao
-- antes de abrir o modal).
CREATE UNIQUE INDEX IF NOT EXISTS idx_fr_extrato_transacao_unico
  ON financeiro_receitas(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fr_unidade_data ON financeiro_receitas(unidade, data);

ALTER TABLE financeiro_receitas ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de financeiro_extrato_transacoes: uma policy por operação,
-- sem split por role — admin-only nesta v1 (mesmo nível de acesso que
-- extrato/conciliação já têm hoje).
DROP POLICY IF EXISTS financeiro_receitas_select ON financeiro_receitas;
CREATE POLICY financeiro_receitas_select ON financeiro_receitas FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_receitas_insert ON financeiro_receitas;
CREATE POLICY financeiro_receitas_insert ON financeiro_receitas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());

DROP POLICY IF EXISTS financeiro_receitas_update ON financeiro_receitas;
CREATE POLICY financeiro_receitas_update ON financeiro_receitas FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_receitas_delete_blocked ON financeiro_receitas;
CREATE POLICY financeiro_receitas_delete_blocked ON financeiro_receitas FOR DELETE USING (false);

-- Verificação
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'financeiro_receitas';
SELECT conta_bancaria, count(*) FROM financeiro_extrato_transacoes GROUP BY 1;
