-- Faturamento diário informado manualmente (por loja + dia + forma de
-- pagamento), pra alimentar a linha "Faturamento" e a comparação com "Meta
-- de Venda" do Fluxo de Caixa sem depender do import de PDV (que é feito em
-- lote, atrasado — não dá pra esperar fechar o mês pra ver o faturamento do
-- dia). Reaproveita o mesmo vocabulário de CategoriaReceita (financeiro_receitas),
-- sem 'outros'.
--
-- Tabela SEPARADA de financeiro_receitas (Entradas de Caixa reais, vindas de
-- conciliação de extrato ou do lançamento manual de dinheiro já existente):
-- o valor informado aqui nunca vira Entrada de Caixa nem lançamento em
-- financeiro_lancamentos — é só o "fechamento de caixa" declarado pelo
-- lojista, guardado na granularidade certa (por forma de pagamento) pra
-- viabilizar, no futuro, comparar contra o que realmente caiu no banco e
-- calcular taxa de cartão/repasse no DRE. Essa reconciliação em si fica pra
-- depois — aqui só a captura do dado.
--
-- Uma linha por (unidade, data): a linha existir já significa "dia
-- fechado" — todas as colunas podem ser 0 (loja fechada num feriado) sem
-- isso ser "não informado". Quem consome (buscarFaturamentoLoja) cai pro
-- valor do PDV só quando NÃO existe linha pro dia, nunca por soma = 0.
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS financeiro_faturamento_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2')),
  data DATE NOT NULL,
  dinheiro NUMERIC NOT NULL DEFAULT 0 CHECK (dinheiro >= 0),
  venda_cartao NUMERIC NOT NULL DEFAULT 0 CHECK (venda_cartao >= 0),
  pix NUMERIC NOT NULL DEFAULT 0 CHECK (pix >= 0),
  repasse_ifood NUMERIC NOT NULL DEFAULT 0 CHECK (repasse_ifood >= 0),
  repasse_aiqfome NUMERIC NOT NULL DEFAULT 0 CHECK (repasse_aiqfome >= 0),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (unidade, data)
);

CREATE INDEX IF NOT EXISTS idx_ffd_unidade_data ON financeiro_faturamento_diario(unidade, data);

ALTER TABLE financeiro_faturamento_diario ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de financeiro_receitas/financeiro_orcamentos: admin-only,
-- DELETE bloqueado (correção é por edição/upsert, nunca remoção — se um dia
-- precisar apagar de verdade, é via SQL Editor, fora do app).
DROP POLICY IF EXISTS financeiro_faturamento_diario_select ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_select ON financeiro_faturamento_diario FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_faturamento_diario_insert ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_insert ON financeiro_faturamento_diario FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());

-- Não exige criado_por = auth.uid(): qualquer admin pode editar um dia
-- lançado por outro admin (mesmo padrão já usado em financeiro_orcamentos).
DROP POLICY IF EXISTS financeiro_faturamento_diario_update ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_update ON financeiro_faturamento_diario FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_faturamento_diario_delete_blocked ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_delete_blocked ON financeiro_faturamento_diario FOR DELETE USING (false);

-- Verificação
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'financeiro_faturamento_diario';
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'financeiro_faturamento_diario' ORDER BY cmd;
