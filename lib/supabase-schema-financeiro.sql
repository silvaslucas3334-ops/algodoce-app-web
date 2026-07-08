-- Módulo Financeiro — Fase 1 (Controle de Despesas)
-- Cria os cadastros de apoio (partes, plano de contas, matérias-primas) e os
-- dois fluxos de lançamento (Compras de Insumos, Despesas Gerais), mais a
-- conciliação de extrato bancário OFX. Execute no Supabase SQL Editor.
--
-- Não confundir financeiro_materias_primas com a tabela `produtos` existente:
-- produtos.tipo='Insumo' é item semi-pronto produzido internamente (rastreado
-- por ordens_producao/lotes_producao/QR code); financeiro_materias_primas é
-- matéria-prima comprada de fornecedor externo (farinha, leite, chocolate).
-- São conceitos disjuntos, sem relação entre si.

-- ============================================================
-- 1. financeiro_partes (fornecedor/beneficiário unificado)
--    Papel como dois booleanos (não enum) porque a mesma parte pode ser as
--    duas coisas: um fornecedor de insumo que também presta um serviço avulso.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_partes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  documento TEXT, -- CNPJ (14 díg.) ou CPF (11 díg.), só números
  papel_fornecedor BOOLEAN NOT NULL DEFAULT false,
  papel_beneficiario BOOLEAN NOT NULL DEFAULT false,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT financeiro_partes_papel_check CHECK (papel_fornecedor OR papel_beneficiario)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financeiro_partes_documento
  ON financeiro_partes (documento) WHERE documento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_financeiro_partes_ativo ON financeiro_partes (ativo);

-- ============================================================
-- 2. financeiro_centros_custo + financeiro_contas (plano de contas)
--    "Entidade" (qual unidade) da planilha original NÃO fica aqui — vira a
--    coluna `unidade` nas tabelas de lançamento (§4/§5), como decidido.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_centros_custo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financeiro_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  centro_custo_id UUID NOT NULL REFERENCES financeiro_centros_custo(id) ON DELETE RESTRICT,
  grupo_dre TEXT NOT NULL, -- linha de DRE que esta conta alimenta (usado na fase futura)
  aplicavel_a TEXT NOT NULL DEFAULT 'ambos' CHECK (aplicavel_a IN ('compras_insumos', 'despesas_gerais', 'ambos')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financeiro_contas_centro ON financeiro_contas(centro_custo_id);

-- Seed: plano de contas real do usuário (Centro de Custo/Conta), passado
-- por ele diretamente nesta conversa. "Entidade" da planilha original
-- (0116=PARAISÓPOLIS, 0205=ITAJUBÁ, 0001=RATEIO) não vira tabela — mapeia
-- para os valores já existentes de `unidade` (loja1/loja2/rateio) nas
-- tabelas de lançamento; 'cozinha' é um valor adicional do app (a planilha
-- do usuário não rateia direto pra cozinha, só pras duas lojas + rateio).
-- grupo_dre e aplicavel_a são inferência minha em cima da conta/descrição
-- real (a planilha não tinha essas duas colunas) — ajustar se necessário.
INSERT INTO financeiro_centros_custo (codigo, nome) VALUES
  ('1000', 'OPERAÇÕES'),
  ('2000', 'VENDAS'),
  ('3000', 'FINANCEIRO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO financeiro_contas (codigo, nome, centro_custo_id, grupo_dre, aplicavel_a) VALUES
  ('1001', 'MATÉRIA-PRIMA',              (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'CMV', 'compras_insumos'),
  ('1002', 'EMBALAGEM',                  (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'CMV', 'compras_insumos'),
  ('1003', 'MÃO DE OBRA',                (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Custos com Pessoal', 'despesas_gerais'),
  ('1004', 'IMPOSTOS DE COMPRA',         (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Impostos', 'compras_insumos'),
  ('1005', 'ENCARGOS TRABALHISTAS',      (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Custos com Pessoal', 'despesas_gerais'),
  ('1006', 'DESPESAS OPERACIONAIS',      (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Despesas Operacionais', 'despesas_gerais'),
  ('1007', 'DESPESAS DIVERSAS',          (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Despesas Diversas', 'despesas_gerais'),
  ('2001', 'DESCONTO DE VENDA',          (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Deduções de Venda', 'despesas_gerais'),
  ('2002', 'MARKETING',                  (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Marketing', 'despesas_gerais'),
  ('2003', 'COMISSÃO APLICATIVO',        (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Despesas com Vendas', 'despesas_gerais'),
  ('2004', 'TAXA DE CARTÕES',            (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Despesas com Vendas', 'despesas_gerais'),
  ('2005', 'IMPOSTOS DE VENDAS',         (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Impostos', 'despesas_gerais'),
  ('2006', 'DIVERSOS',                   (SELECT id FROM financeiro_centros_custo WHERE codigo='2000'), 'Despesas Diversas', 'despesas_gerais'),
  ('3001', 'EMPRÉSTIMOS',                (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Despesas Financeiras', 'despesas_gerais'),
  ('3002', 'PROVISÕES TRABALHISTAS',     (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Custos com Pessoal', 'despesas_gerais'),
  ('3003', 'AMORTIZAÇÕES',               (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Despesas Financeiras', 'despesas_gerais'),
  ('3004', 'DISTRIBUIÇÃO LUCRO',         (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Distribuição de Lucro', 'despesas_gerais'),
  ('3005', 'DESPESAS FINANCEIRAS',       (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Despesas Financeiras', 'despesas_gerais'),
  ('3006', 'SERVIÇOS CONTÁBEIS',         (SELECT id FROM financeiro_centros_custo WHERE codigo='3000'), 'Despesas Administrativas', 'despesas_gerais')
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- 3. financeiro_materias_primas (cadastro controlado, sem texto livre)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_materias_primas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE, -- elimina "Limão Taiti" vs "Limão kg" vs "Limão"
  unidade_medida TEXT NOT NULL,  -- unidade da ficha técnica futura, ex: 'g', 'ml', 'un'
  unidade_compra TEXT NOT NULL,  -- unidade da nota fiscal, ex: 'kg', 'caixa', 'un'
  fator_conversao NUMERIC NOT NULL CHECK (fator_conversao > 0), -- unidades_medida por 1 unidade_compra (1kg=1000g -> 1000)
  conta_id UUID REFERENCES financeiro_contas(id), -- classificação contábil padrão do item (1001 matéria-prima, 1002 embalagem...); cada compra herda esta conta no lançamento
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 4. financeiro_compras_insumos
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_compras_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  fornecedor_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  numero_nota_fiscal TEXT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),           -- em unidade_compra
  valor_unitario NUMERIC NOT NULL CHECK (valor_unitario >= 0),
  valor_total NUMERIC NOT NULL CHECK (valor_total >= 0),        -- editável: nota pode arredondar diferente de qtd×unit
  data_compra DATE NOT NULL,
  data_pagamento DATE,
  unidade TEXT NOT NULL CHECK (unidade IN ('cozinha', 'loja1', 'loja2', 'rateio')),
  conta_id UUID REFERENCES financeiro_contas(id), -- opcional no lançamento rápido; admin classifica depois
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  forma_pagamento TEXT,
  extrato_transacao_id UUID, -- FK adicionada em §6, depois que financeiro_extrato_transacoes existir
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fci_materia_prima_data ON financeiro_compras_insumos(materia_prima_id, data_compra);
CREATE INDEX IF NOT EXISTS idx_fci_status ON financeiro_compras_insumos(status);
CREATE INDEX IF NOT EXISTS idx_fci_fornecedor ON financeiro_compras_insumos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_fci_unidade ON financeiro_compras_insumos(unidade);

-- ============================================================
-- 5. financeiro_despesas
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  unidade TEXT NOT NULL CHECK (unidade IN ('cozinha', 'loja1', 'loja2', 'rateio')),
  conta_id UUID REFERENCES financeiro_contas(id), -- opcional: admin classifica antes de fechar o mês
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  forma_pagamento TEXT,
  numero_documento TEXT,
  extrato_transacao_id UUID, -- FK adicionada em §6
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fd_status ON financeiro_despesas(status);
CREATE INDEX IF NOT EXISTS idx_fd_vencimento ON financeiro_despesas(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_fd_parte ON financeiro_despesas(parte_id);
CREATE INDEX IF NOT EXISTS idx_fd_unidade ON financeiro_despesas(unidade);

-- ============================================================
-- 6. financeiro_extrato_transacoes (checkpoint OFX + conciliação)
--    O índice único (conta_bancaria, fitid) É o checkpoint de dedupe:
--    reimportar um OFX com período sobreposto não insere duplicata.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_extrato_transacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria TEXT NOT NULL DEFAULT 'principal',
  fitid TEXT NOT NULL, -- <FITID> do OFX; chave sintética se ausente (raro)
  data DATE NOT NULL,
  valor NUMERIC NOT NULL, -- negativo = saída/pagamento, positivo = entrada
  descricao_original TEXT NOT NULL,
  documento_extraido TEXT, -- CNPJ/CPF extraído da descrição PIX
  parte_id UUID REFERENCES financeiro_partes(id),
  tipo_match TEXT CHECK (tipo_match IN ('compra_insumo', 'despesa_geral')),
  compra_insumo_id UUID REFERENCES financeiro_compras_insumos(id),
  despesa_id UUID REFERENCES financeiro_despesas(id),
  status_conciliacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_conciliacao IN ('pendente', 'conciliado', 'ignorado')),
  importado_por UUID NOT NULL REFERENCES usuarios(id),
  importado_em TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fet_um_match_so CHECK (compra_insumo_id IS NULL OR despesa_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fet_dedupe ON financeiro_extrato_transacoes(conta_bancaria, fitid);
CREATE INDEX IF NOT EXISTS idx_fet_status ON financeiro_extrato_transacoes(status_conciliacao);
CREATE INDEX IF NOT EXISTS idx_fet_data ON financeiro_extrato_transacoes(data);

DO $$ BEGIN
  ALTER TABLE financeiro_compras_insumos
    ADD CONSTRAINT fci_extrato_fk FOREIGN KEY (extrato_transacao_id) REFERENCES financeiro_extrato_transacoes(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE financeiro_despesas
    ADD CONSTRAINT fd_extrato_fk FOREIGN KEY (extrato_transacao_id) REFERENCES financeiro_extrato_transacoes(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 7. View: custo médio MENSAL por matéria-prima (nunca cumulativo/estoque)
--    Recalcula do zero a cada consulta a partir das compras daquele mês.
--    Conversão: cada compra registra quantidade/valor_total na unidade_compra
--    (ex: 5kg por R$50); custo_medio_por_unidade_compra = valor/qtd (preço
--    médio por kg no mês); custo_medio_por_unidade_medida converte para a
--    unidade da ficha técnica dividindo pelo fator_conversao (ex: preço por
--    grama, já que 1kg = 1000g).
--    security_invoker=true faz a view respeitar a RLS de quem consulta (não
--    do dono da view) — sem isso, loja/cozinha enxergariam o agregado de
--    TODAS as unidades via a view mesmo não tendo acesso direto às linhas de
--    outras unidades em financeiro_compras_insumos. Requer Postgres 15+;
--    confirme com "SELECT version()" antes de rodar — se for anterior, remova
--    a cláusula e trate como item do próximo Security Advisor (a view ficaria
--    restrita na prática porque só a tela admin-only a consulta, mas o
--    reforço em RLS é a defesa correta, igual ao padrão já usado neste app).
-- ============================================================
CREATE OR REPLACE VIEW financeiro_custo_medio_mensal
WITH (security_invoker = true) AS
SELECT
  ci.materia_prima_id,
  date_trunc('month', ci.data_compra)::date AS mes_referencia,
  mp.nome AS materia_prima_nome,
  mp.unidade_medida,
  mp.unidade_compra,
  mp.fator_conversao,
  SUM(ci.quantidade) AS quantidade_total,
  SUM(ci.valor_total) AS valor_total,
  SUM(ci.valor_total) / NULLIF(SUM(ci.quantidade), 0) AS custo_medio_por_unidade_compra,
  (SUM(ci.valor_total) / NULLIF(SUM(ci.quantidade), 0)) / NULLIF(mp.fator_conversao, 0) AS custo_medio_por_unidade_medida,
  COUNT(*) AS numero_compras
FROM financeiro_compras_insumos ci
JOIN financeiro_materias_primas mp ON mp.id = ci.materia_prima_id
WHERE ci.status <> 'cancelado'
GROUP BY ci.materia_prima_id, date_trunc('month', ci.data_compra), mp.nome, mp.unidade_medida, mp.unidade_compra, mp.fator_conversao;

-- ============================================================
-- 8. Função auxiliar de RLS: unidade travada do usuário (loja/cozinha)
--    admin não tem unidade travada (retorna NULL -> policies liberam tudo).
-- ============================================================
CREATE OR REPLACE FUNCTION financeiro_unidade_do_usuario() RETURNS TEXT AS $$
  SELECT CASE
    WHEN role = 'cozinha' THEN 'cozinha'
    WHEN role = 'loja' THEN loja_id
    ELSE NULL
  END
  FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- 9. RLS
-- ============================================================
ALTER TABLE financeiro_partes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_materias_primas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_compras_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_extrato_transacoes ENABLE ROW LEVEL SECURITY;

-- --- Cadastros de apoio (partes, centros_custo, contas, materias_primas):
-- --- leitura para todo autenticado (loja/cozinha precisam popular os
-- --- <select> dos formulários), escrita só admin (evita cadastro duplicado).
-- NOTA: "FOR ALL" concederia DELETE ao admin (policies são combinadas com OR),
-- o que anularia a policy delete_blocked abaixo. Por isso INSERT/UPDATE são
-- policies separadas em vez de uma única "FOR ALL" — DELETE nunca é concedido
-- por nenhuma policy, nem para admin, então a policy USING(false) é definitiva.
DROP POLICY IF EXISTS financeiro_partes_select ON financeiro_partes;
CREATE POLICY financeiro_partes_select ON financeiro_partes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS financeiro_partes_insert_admin ON financeiro_partes;
CREATE POLICY financeiro_partes_insert_admin ON financeiro_partes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_partes_update_admin ON financeiro_partes;
CREATE POLICY financeiro_partes_update_admin ON financeiro_partes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_partes_delete_blocked ON financeiro_partes;
CREATE POLICY financeiro_partes_delete_blocked ON financeiro_partes FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_centros_custo_select ON financeiro_centros_custo;
CREATE POLICY financeiro_centros_custo_select ON financeiro_centros_custo FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS financeiro_centros_custo_insert_admin ON financeiro_centros_custo;
CREATE POLICY financeiro_centros_custo_insert_admin ON financeiro_centros_custo FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_centros_custo_update_admin ON financeiro_centros_custo;
CREATE POLICY financeiro_centros_custo_update_admin ON financeiro_centros_custo FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_centros_custo_delete_blocked ON financeiro_centros_custo;
CREATE POLICY financeiro_centros_custo_delete_blocked ON financeiro_centros_custo FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_contas_select ON financeiro_contas;
CREATE POLICY financeiro_contas_select ON financeiro_contas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS financeiro_contas_insert_admin ON financeiro_contas;
CREATE POLICY financeiro_contas_insert_admin ON financeiro_contas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_contas_update_admin ON financeiro_contas;
CREATE POLICY financeiro_contas_update_admin ON financeiro_contas FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_contas_delete_blocked ON financeiro_contas;
CREATE POLICY financeiro_contas_delete_blocked ON financeiro_contas FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_materias_primas_select ON financeiro_materias_primas;
CREATE POLICY financeiro_materias_primas_select ON financeiro_materias_primas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS financeiro_materias_primas_insert_admin ON financeiro_materias_primas;
CREATE POLICY financeiro_materias_primas_insert_admin ON financeiro_materias_primas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_materias_primas_update_admin ON financeiro_materias_primas;
CREATE POLICY financeiro_materias_primas_update_admin ON financeiro_materias_primas FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_materias_primas_delete_blocked ON financeiro_materias_primas;
CREATE POLICY financeiro_materias_primas_delete_blocked ON financeiro_materias_primas FOR DELETE USING (false);

-- --- financeiro_compras_insumos / financeiro_despesas:
-- --- admin vê/edita tudo; loja/cozinha só a própria unidade, e só edita
-- --- enquanto status='aberto' (depois de conciliado/pago, só admin mexe).
DROP POLICY IF EXISTS financeiro_compras_insumos_select ON financeiro_compras_insumos;
CREATE POLICY financeiro_compras_insumos_select ON financeiro_compras_insumos FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR unidade = financeiro_unidade_do_usuario()
  );
DROP POLICY IF EXISTS financeiro_compras_insumos_insert ON financeiro_compras_insumos;
CREATE POLICY financeiro_compras_insumos_insert ON financeiro_compras_insumos FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR unidade = financeiro_unidade_do_usuario()
    )
  );
DROP POLICY IF EXISTS financeiro_compras_insumos_update ON financeiro_compras_insumos;
CREATE POLICY financeiro_compras_insumos_update ON financeiro_compras_insumos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  );
DROP POLICY IF EXISTS financeiro_compras_insumos_delete_blocked ON financeiro_compras_insumos;
CREATE POLICY financeiro_compras_insumos_delete_blocked ON financeiro_compras_insumos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_despesas_select ON financeiro_despesas;
CREATE POLICY financeiro_despesas_select ON financeiro_despesas FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR unidade = financeiro_unidade_do_usuario()
  );
DROP POLICY IF EXISTS financeiro_despesas_insert ON financeiro_despesas;
CREATE POLICY financeiro_despesas_insert ON financeiro_despesas FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR unidade = financeiro_unidade_do_usuario()
    )
  );
DROP POLICY IF EXISTS financeiro_despesas_update ON financeiro_despesas;
CREATE POLICY financeiro_despesas_update ON financeiro_despesas FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  );
DROP POLICY IF EXISTS financeiro_despesas_delete_blocked ON financeiro_despesas;
CREATE POLICY financeiro_despesas_delete_blocked ON financeiro_despesas FOR DELETE USING (false);

-- --- financeiro_extrato_transacoes: só admin (conciliação bancária).
DROP POLICY IF EXISTS financeiro_extrato_transacoes_select ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_select ON financeiro_extrato_transacoes FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_extrato_transacoes_insert ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_insert ON financeiro_extrato_transacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_extrato_transacoes_update ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_update ON financeiro_extrato_transacoes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_extrato_transacoes_delete_blocked ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_delete_blocked ON financeiro_extrato_transacoes FOR DELETE USING (false);

-- ============================================================
-- Verificação: todas as 7 tabelas devem aparecer com rowsecurity = true.
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename LIKE 'financeiro_%'
ORDER BY tablename;
