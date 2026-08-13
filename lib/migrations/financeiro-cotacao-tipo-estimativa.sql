-- Cotação tipo 'estimativa': lista de compra à vista pra UM fornecedor só
-- (ex: supermercado, "compramos à vista, não fazemos pedido") — preço
-- estimado automaticamente a partir do histórico de compras
-- (lib/financeiro-cotacoes.ts: estimarPrecosCotacao), sem exigir resposta
-- manual do fornecedor. 'comprado' é o checklist físico de compra, usável
-- nos dois tipos de cotação (não só estimativa).

ALTER TABLE financeiro_cotacoes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'fornecedores';
ALTER TABLE financeiro_cotacoes DROP CONSTRAINT IF EXISTS financeiro_cotacoes_tipo_check;
ALTER TABLE financeiro_cotacoes ADD CONSTRAINT financeiro_cotacoes_tipo_check CHECK (tipo IN ('fornecedores', 'estimativa'));

ALTER TABLE financeiro_cotacao_itens
  ADD COLUMN IF NOT EXISTS comprado BOOLEAN NOT NULL DEFAULT false;

-- Diferente das outras 3 tabelas do módulo (fornecedores/preços seguem
-- DELETE-blocked) — remover um item errado da lista antes de fechar é uma
-- correção legítima (edição geral de cotação aberta); depois de fechada,
-- os itens viram histórico e o DELETE volta a ficar bloqueado.
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens;
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_delete ON financeiro_cotacao_itens FOR DELETE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha')
    AND EXISTS (SELECT 1 FROM financeiro_cotacoes c WHERE c.id = cotacao_id AND c.status = 'aberta')
  );

-- Verificação
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'financeiro_cotacoes' AND column_name = 'tipo';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'financeiro_cotacao_itens' AND column_name = 'comprado';
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'financeiro_cotacao_itens' ORDER BY cmd;
