-- Módulo Financeiro — schema completo (fase 1.5, lançamentos unificados)
-- Cadastros de apoio (partes, plano de contas, matérias-primas) + tabela
-- ÚNICA de lançamentos financeiros (despesas manuais e notas de insumo,
-- que geram sua despesa automaticamente) + conciliação de extrato OFX +
-- recorrências mensais. Execute no Supabase SQL Editor.
--
-- Para bancos que já rodaram a fase 1, use
-- lib/migrations/reestrutura-lancamentos-financeiros.sql em vez deste.
--
-- Não confundir financeiro_materias_primas com a tabela `produtos` existente:
-- produtos.tipo='Insumo' é item semi-pronto produzido internamente (rastreado
-- por ordens_producao/lotes_producao/QR code); financeiro_materias_primas é
-- matéria-prima comprada de fornecedor externo (farinha, leite, chocolate).

-- ============================================================
-- 1. financeiro_partes (fornecedor/beneficiário unificado)
--    Papel como dois booleanos porque a mesma parte pode ser as duas coisas.
--    documento é OBRIGATÓRIO: é a chave do match automático com o extrato.
--    forma/condição/prazo pré-preenchem os lançamentos (editáveis lá).
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_partes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  documento TEXT NOT NULL, -- CNPJ (14 díg.) ou CPF (11 díg.), só números
  papel_fornecedor BOOLEAN NOT NULL DEFAULT false,
  papel_beneficiario BOOLEAN NOT NULL DEFAULT false,
  forma_pagamento_padrao TEXT CHECK (forma_pagamento_padrao IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  condicao_pagamento TEXT NOT NULL DEFAULT 'a_vista' CHECK (condicao_pagamento IN ('a_vista', 'a_prazo')),
  prazo_dias INT CHECK (prazo_dias IN (7, 15, 30)), -- dias após a data da compra, quando a prazo
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
--    "Entidade" da planilha original (0116/0205/0001 = sufixos dos CNPJs)
--    não fica aqui — vira a coluna `unidade` nos lançamentos.
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
  grupo_dre TEXT NOT NULL, -- linha de DRE que esta conta alimenta
  aplicavel_a TEXT NOT NULL DEFAULT 'ambos' CHECK (aplicavel_a IN ('compras_insumos', 'despesas_gerais', 'ambos')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financeiro_contas_centro ON financeiro_contas(centro_custo_id);

-- Seed: plano de contas real do usuário (Centro de Custo/Conta).
-- grupo_dre e aplicavel_a são inferência a validar.
INSERT INTO financeiro_centros_custo (codigo, nome) VALUES
  ('1000', 'OPERAÇÕES'),
  ('2000', 'VENDAS'),
  ('3000', 'FINANCEIRO')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO financeiro_contas (codigo, nome, centro_custo_id, grupo_dre, aplicavel_a) VALUES
  ('1001', 'MATÉRIA-PRIMA',              (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'CMV', 'compras_insumos'),
  ('1002', 'EMBALAGEM',                  (SELECT id FROM financeiro_centros_custo WHERE codigo='1000'), 'Embalagens', 'compras_insumos'),
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
CREATE SEQUENCE IF NOT EXISTS financeiro_mp_codigo_seq;

CREATE TABLE IF NOT EXISTS financeiro_materias_primas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL DEFAULT ('MP-' || LPAD(nextval('financeiro_mp_codigo_seq')::text, 4, '0')),
  nome TEXT NOT NULL UNIQUE, -- elimina "Limão Taiti" vs "Limão kg" vs "Limão"
  unidade_medida TEXT NOT NULL,  -- unidade da ficha técnica (financeiro_pre_preparo_itens/financeiro_produto_final_itens), ex: 'g', 'ml', 'un'
  unidade_compra TEXT NOT NULL,  -- unidade usual de compra, ex: 'kg', 'caixa', 'un'
  fator_conversao NUMERIC NOT NULL CHECK (fator_conversao > 0), -- unidade_medida por 1 unidade_compra (1kg=1000g -> 1000)
  conta_id UUID REFERENCES financeiro_contas(id), -- classificação contábil padrão do item; itens da nota herdam
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER SEQUENCE financeiro_mp_codigo_seq OWNED BY financeiro_materias_primas.codigo;
GRANT USAGE ON SEQUENCE financeiro_mp_codigo_seq TO authenticated;

-- ============================================================
-- 4. financeiro_extrato_transacoes (checkpoint OFX + conciliação)
--    Índice único (conta_bancaria, fitid) = checkpoint de dedupe.
--    Criada antes de lancamentos por causa da FK extrato_transacao_id;
--    a FK lancamento_id daqui é adicionada em §7.
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
  lancamento_id UUID, -- FK adicionada em §7
  status_conciliacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_conciliacao IN ('pendente', 'conciliado', 'ignorado')),
  importado_por UUID NOT NULL REFERENCES usuarios(id),
  importado_em TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fet_dedupe ON financeiro_extrato_transacoes(conta_bancaria, fitid);
CREATE INDEX IF NOT EXISTS idx_fet_status ON financeiro_extrato_transacoes(status_conciliacao);
CREATE INDEX IF NOT EXISTS idx_fet_data ON financeiro_extrato_transacoes(data);

-- ============================================================
-- 5. financeiro_recorrencias (despesas fixas mensais)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_recorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  dia_vencimento INT NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2', 'rateio')), -- cozinha entra como rateio (0001), não é entidade própria
  conta_id UUID NOT NULL REFERENCES financeiro_contas(id),
  -- Quantos meses a competência fica ATRÁS do mês em que o lançamento é
  -- gerado (salário/aluguel pagos depois de usados = 1). Ver DRE.
  competencia_deslocamento_meses INT NOT NULL DEFAULT 0 CHECK (competencia_deslocamento_meses BETWEEN 0 AND 2),
  ativa BOOLEAN NOT NULL DEFAULT true,
  proxima_data DATE NOT NULL,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. financeiro_lancamentos — a tabela ÚNICA de lançamentos
--    tipo='despesa'        → despesa manual (salário, aluguel, recibo)
--    tipo='compra_insumos' → gerada pelo formulário de Nota (itens em §6b)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'compra_insumos')),
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id) ON DELETE RESTRICT,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL CHECK (valor_total > 0),
  numero_documento TEXT,
  data_lancamento DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  -- A que mês esse lançamento pertence economicamente (regime de
  -- competência, usado pelo DRE) — distinto de data_lancamento/data_pagamento
  -- (regime de caixa, usado pelo Fluxo de Caixa). Ver lib/financeiro-dre.ts.
  data_competencia DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  forma_pagamento TEXT CHECK (forma_pagamento IN ('boleto', 'pix', 'cartao_debito', 'dinheiro')),
  condicao_pagamento TEXT CHECK (condicao_pagamento IN ('a_vista', 'a_prazo')),
  parcela_num INT,
  parcela_total INT,
  grupo_parcelamento UUID,
  recorrencia_id UUID REFERENCES financeiro_recorrencias(id),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2', 'rateio')), -- cozinha entra como rateio (0001), não é entidade própria
  conta_id UUID REFERENCES financeiro_contas(id),
  extrato_transacao_id UUID REFERENCES financeiro_extrato_transacoes(id),
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fl_conta_obrigatoria_despesa CHECK (tipo = 'compra_insumos' OR conta_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_fl_status ON financeiro_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_fl_vencimento ON financeiro_lancamentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_fl_parte ON financeiro_lancamentos(parte_id);
CREATE INDEX IF NOT EXISTS idx_fl_unidade ON financeiro_lancamentos(unidade);
CREATE INDEX IF NOT EXISTS idx_fl_grupo_parcelamento ON financeiro_lancamentos(grupo_parcelamento) WHERE grupo_parcelamento IS NOT NULL;
-- Evita duas despesas apontando pra mesma transação de extrato (ex: INSERT
-- do lançamento sucede mas o vínculo seguinte falha, e uma retentativa
-- criaria duplicata). Mesmo padrão de idx_fr_extrato_transacao_unico em
-- financeiro_receitas. Ver lib/migrations/add-indice-unico-extrato-lancamento.sql.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fl_extrato_transacao_unico
  ON financeiro_lancamentos(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;

-- ============================================================
-- 6b. financeiro_lancamento_itens — itens da nota (alimenta o CMV)
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_lancamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id UUID NOT NULL REFERENCES financeiro_lancamentos(id) ON DELETE RESTRICT,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0), -- na unidade_nota
  unidade_nota TEXT NOT NULL, -- unidade impressa na NF
  fator_conversao NUMERIC NOT NULL CHECK (fator_conversao > 0), -- unidade_medida por 1 unidade_nota
  valor_unitario NUMERIC NOT NULL CHECK (valor_unitario >= 0),
  valor_total NUMERIC NOT NULL CHECK (valor_total >= 0),
  conta_id UUID REFERENCES financeiro_contas(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fli_lancamento ON financeiro_lancamento_itens(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_fli_materia_prima ON financeiro_lancamento_itens(materia_prima_id);

-- ============================================================
-- 7. FK do extrato para o lançamento conciliado
-- ============================================================
DO $$ BEGIN
  ALTER TABLE financeiro_extrato_transacoes
    ADD CONSTRAINT fet_lancamento_fk FOREIGN KEY (lancamento_id) REFERENCES financeiro_lancamentos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 8. View: custo médio MENSAL por matéria-prima
--    Normaliza tudo para unidade_medida via fator_conversao POR LINHA.
--    security_invoker: respeita a RLS de quem consulta (requer PG15+).
-- ============================================================
DROP VIEW IF EXISTS financeiro_custo_medio_mensal;
CREATE VIEW financeiro_custo_medio_mensal
WITH (security_invoker = true) AS
SELECT
  it.materia_prima_id,
  date_trunc('month', l.data_lancamento)::date AS mes_referencia,
  mp.nome AS materia_prima_nome,
  mp.unidade_medida,
  SUM(it.quantidade * it.fator_conversao) AS quantidade_convertida,
  SUM(it.valor_total) AS valor_total,
  SUM(it.valor_total) / NULLIF(SUM(it.quantidade * it.fator_conversao), 0) AS custo_medio_por_unidade_medida,
  COUNT(*) AS numero_compras
FROM financeiro_lancamento_itens it
JOIN financeiro_lancamentos l ON l.id = it.lancamento_id
JOIN financeiro_materias_primas mp ON mp.id = it.materia_prima_id
WHERE l.status <> 'cancelado'
GROUP BY it.materia_prima_id, date_trunc('month', l.data_lancamento), mp.nome, mp.unidade_medida;

-- ============================================================
-- 9. Função auxiliar de RLS + RLS
-- ============================================================
-- Cozinha não é entidade própria no plano de contas — seus lançamentos
-- entram como rateio (0001), já que não são atribuídos a uma loja específica.
CREATE OR REPLACE FUNCTION financeiro_unidade_do_usuario() RETURNS TEXT AS $$
  SELECT CASE
    WHEN role = 'cozinha' THEN 'rateio'
    WHEN role = 'loja' THEN loja_id
    ELSE NULL
  END
  FROM usuarios WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE financeiro_partes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_materias_primas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_lancamento_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_extrato_transacoes ENABLE ROW LEVEL SECURITY;

-- Cadastros de apoio: leitura para todo autenticado, escrita só admin.
-- INSERT/UPDATE separados (não FOR ALL) para que DELETE nunca seja concedido.
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

-- lancamentos: admin tudo; loja/cozinha só a própria unidade, edição só em aberto.
DROP POLICY IF EXISTS financeiro_lancamentos_select ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_select ON financeiro_lancamentos FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR unidade = financeiro_unidade_do_usuario()
  );
DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR unidade = financeiro_unidade_do_usuario()
    )
  );
DROP POLICY IF EXISTS financeiro_lancamentos_update ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_update ON financeiro_lancamentos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (unidade = financeiro_unidade_do_usuario() AND status = 'aberto')
  );
DROP POLICY IF EXISTS financeiro_lancamentos_delete_blocked ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_delete_blocked ON financeiro_lancamentos FOR DELETE USING (false);

-- itens: acesso segue o lançamento pai.
DROP POLICY IF EXISTS financeiro_lancamento_itens_select ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_select ON financeiro_lancamento_itens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR l.unidade = financeiro_unidade_do_usuario()
        )
    )
  );
-- INSERT não trava por status: criar os itens é parte do mesmo fluxo
-- atômico de lançar a nota, mesmo quando ela já nasce paga (status='pago')
-- — só a UPDATE (editar item depois) trava em status='aberto'.
DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR l.unidade = financeiro_unidade_do_usuario()
        )
    )
  );
DROP POLICY IF EXISTS financeiro_lancamento_itens_update ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_update ON financeiro_lancamento_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.unidade = financeiro_unidade_do_usuario() AND l.status = 'aberto')
        )
    )
  );
-- DELETE liberado só pro admin — corrige item errado sem refazer a nota
-- inteira. O cabeçalho (financeiro_lancamentos) continua sem DELETE nunca.
DROP POLICY IF EXISTS financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_delete_admin ON financeiro_lancamento_itens FOR DELETE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

-- recorrencias: só admin.
DROP POLICY IF EXISTS financeiro_recorrencias_select ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_select ON financeiro_recorrencias FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_insert ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_insert ON financeiro_recorrencias FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_update ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_update ON financeiro_recorrencias FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_recorrencias_delete_blocked ON financeiro_recorrencias;
CREATE POLICY financeiro_recorrencias_delete_blocked ON financeiro_recorrencias FOR DELETE USING (false);

-- extrato: só admin (conciliação bancária).
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
-- 10. Geração automática das despesas recorrentes (pg_cron)
-- ============================================================
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

-- Habilita a extensão pg_cron se ainda não estiver ativa neste projeto.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 03:15 UTC = 00:15 em São Paulo.
-- unschedule antes torna o script re-executável sem erro de job duplicado.
DO $$ BEGIN
  PERFORM cron.unschedule('gerar-lancamentos-recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('gerar-lancamentos-recorrentes', '15 3 * * *', 'SELECT gerar_lancamentos_recorrentes()');

-- ============================================================
-- Verificação
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename LIKE 'financeiro_%'
ORDER BY tablename;

-- ============================================================
-- 11. Import do PDV — financeiro_pdv_pedidos / financeiro_pdv_itens
--    Módulo aditivo (fase "Import do PDV"). Ver detalhes/racional completo
--    em lib/migrations/criar-financeiro-pdv.sql — conteúdo idêntico,
--    replicado aqui pra esse arquivo continuar sendo a fonte única de
--    instalação limpa.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_pdv_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2')),
  codigo TEXT NOT NULL,
  data_abertura TIMESTAMPTZ NOT NULL,
  data_fechamento TIMESTAMPTZ,
  -- Data-base do período do relatório (é a data de emissão da NF). Cai para
  -- data_abertura quando o pedido ainda não fechou. AT TIME ZONE INTERVAL
  -- (não nome de zona): coluna gerada exige expressão IMMUTABLE.
  data_periodo DATE GENERATED ALWAYS AS (
    (COALESCE(data_fechamento, data_abertura) AT TIME ZONE INTERVAL '-03:00')::date
  ) STORED,
  status TEXT NOT NULL, -- vocabulário de terceiro (PDV), sem CHECK — validado em lib/pdv-import.ts
  tot_itens NUMERIC, -- é o valor (subtotal dos itens antes de ajustes), não uma contagem — nome do PDV engana
  servico NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  valor_entrega NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  total_recebido NUMERIC,
  forma_pagamento TEXT,
  nota_emitida BOOLEAN,
  serie_nf TEXT,
  numero_nf TEXT,
  importado_por UUID NOT NULL REFERENCES usuarios(id),
  importado_em TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpp_dedupe ON financeiro_pdv_pedidos(unidade, codigo);
CREATE INDEX IF NOT EXISTS idx_fpp_unidade_data ON financeiro_pdv_pedidos(unidade, data_abertura);
CREATE INDEX IF NOT EXISTS idx_fpp_unidade_periodo ON financeiro_pdv_pedidos(unidade, data_periodo);
CREATE INDEX IF NOT EXISTS idx_fpp_status ON financeiro_pdv_pedidos(status);

CREATE TABLE IF NOT EXISTS financeiro_pdv_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES financeiro_pdv_pedidos(id) ON DELETE CASCADE,
  ordem_pedido INT NOT NULL,
  data_hora_item TIMESTAMPTZ NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  valor_total_item NUMERIC NOT NULL DEFAULT 0,
  -- Vocabulário do PDV (Produto/Complemento/Item de combo/...), sem CHECK
  -- pelo mesmo motivo do status do pedido — validado em lib/pdv-import.ts.
  tipo_item TEXT NOT NULL,
  nome_produto TEXT NOT NULL,
  tipo_produto TEXT,
  categoria_produto TEXT,
  codigo_produto_pdv TEXT, -- reservado p/ fase de CMV
  importado_em TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fpi_pedido ON financeiro_pdv_itens(pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpi_ordem ON financeiro_pdv_itens(pedido_id, ordem_pedido);

ALTER TABLE financeiro_pdv_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_pdv_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_pdv_pedidos_select ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_select ON financeiro_pdv_pedidos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pdv_pedidos_insert_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_insert_blocked ON financeiro_pdv_pedidos FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS financeiro_pdv_pedidos_update_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_update_blocked ON financeiro_pdv_pedidos FOR UPDATE USING (false);
DROP POLICY IF EXISTS financeiro_pdv_pedidos_delete_blocked ON financeiro_pdv_pedidos;
CREATE POLICY financeiro_pdv_pedidos_delete_blocked ON financeiro_pdv_pedidos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_pdv_itens_select ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_select ON financeiro_pdv_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pdv_itens_insert_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_insert_blocked ON financeiro_pdv_itens FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS financeiro_pdv_itens_update_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_update_blocked ON financeiro_pdv_itens FOR UPDATE USING (false);
DROP POLICY IF EXISTS financeiro_pdv_itens_delete_blocked ON financeiro_pdv_itens;
CREATE POLICY financeiro_pdv_itens_delete_blocked ON financeiro_pdv_itens FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION financeiro_pdv_substituir_periodo(
  p_unidade TEXT, p_data_min DATE, p_data_max DATE,
  p_pedidos JSONB, p_itens JSONB, p_importado_por UUID
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
    AND (
      data_periodo BETWEEN p_data_min AND p_data_max
      OR codigo IN (SELECT codigo FROM jsonb_to_recordset(p_pedidos) AS x(codigo TEXT))
    );
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

GRANT EXECUTE ON FUNCTION financeiro_pdv_substituir_periodo TO authenticated;

CREATE OR REPLACE FUNCTION financeiro_pdv_excluir_periodo(
  p_unidade TEXT, p_data_min DATE, p_data_max DATE
) RETURNS JSONB AS $$
DECLARE
  v_removidos INT;
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode excluir períodos do PDV';
  END IF;

  DELETE FROM financeiro_pdv_pedidos
  WHERE unidade = p_unidade AND data_periodo BETWEEN p_data_min AND p_data_max;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;

  RETURN jsonb_build_object('pedidos_removidos', v_removidos);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_pdv_excluir_periodo TO authenticated;

-- ============================================================
-- 12. Fluxo de Caixa — financeiro_receitas
--    Módulo aditivo (fase "Fluxo de Caixa"). Ver detalhes/racional completo
--    em lib/migrations/criar-financeiro-receitas.sql — conteúdo idêntico,
--    replicado aqui pra esse arquivo continuar sendo a fonte única de
--    instalação limpa.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2')),
  categoria TEXT NOT NULL CHECK (categoria IN ('venda_cartao', 'pix', 'dinheiro', 'repasse_ifood', 'repasse_aiqfome', 'outros')),
  data DATE NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  -- Opcional. NUNCA substitui `valor` (que continua sendo sempre o
  -- líquido que bateu no extrato) — só o DRE lê valor_bruto, pra calcular
  -- a taxa de cartão/app (venda_cartao, repasse_ifood, repasse_aiqfome)
  -- como diferença, sem nunca virar lançamento em financeiro_lancamentos.
  valor_bruto NUMERIC CHECK (valor_bruto IS NULL OR valor_bruto >= valor),
  observacao TEXT,
  extrato_transacao_id UUID REFERENCES financeiro_extrato_transacoes(id),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fr_extrato_dinheiro_check CHECK (
    (categoria = 'dinheiro' AND extrato_transacao_id IS NULL) OR
    (categoria <> 'dinheiro' AND extrato_transacao_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fr_extrato_transacao_unico
  ON financeiro_receitas(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fr_unidade_data ON financeiro_receitas(unidade, data);

ALTER TABLE financeiro_receitas ENABLE ROW LEVEL SECURITY;

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

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_pdv_%';

-- ============================================================
-- 13. Cotações (RFQ) + histórico de custo por fornecedor
--    Módulo aditivo. Ver detalhes/racional completo em
--    lib/migrations/criar-financeiro-cotacoes.sql — conteúdo idêntico,
--    replicado aqui pra esse arquivo continuar sendo a fonte única de
--    instalação limpa.
-- ============================================================
CREATE TABLE IF NOT EXISTS financeiro_cotacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  -- Só pré-preenche a unidade da nota ao fechar — NÃO é usada para RLS
  -- (diferente de financeiro_lancamentos.unidade, que escopa
  -- financeiro_unidade_do_usuario()). Cotações são admin-only, ponto.
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2', 'rateio')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  fornecedor_vencedor_id UUID REFERENCES financeiro_partes(id),
  observacoes TEXT,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  fechado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cotacoes_status ON financeiro_cotacoes(status);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES financeiro_cotacoes(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  unidade_cotacao TEXT NOT NULL, -- snapshot de unidade_compra no momento da criação
  observacao TEXT,
  UNIQUE (cotacao_id, materia_prima_id) -- evita item duplicado por clique duplo
);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID NOT NULL REFERENCES financeiro_cotacoes(id) ON DELETE CASCADE,
  parte_id UUID NOT NULL REFERENCES financeiro_partes(id),
  status TEXT NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'respondido', 'sem_resposta')),
  respondido_em TIMESTAMPTZ,
  UNIQUE (cotacao_id, parte_id)
);

CREATE TABLE IF NOT EXISTS financeiro_cotacao_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_item_id UUID NOT NULL REFERENCES financeiro_cotacao_itens(id) ON DELETE CASCADE,
  cotacao_fornecedor_id UUID NOT NULL REFERENCES financeiro_cotacao_fornecedores(id) ON DELETE CASCADE,
  valor_unitario NUMERIC CHECK (valor_unitario >= 0),
  valor_total NUMERIC CHECK (valor_total >= 0),
  disponivel BOOLEAN NOT NULL DEFAULT true, -- false = fornecedor respondeu mas não tem esse item
  UNIQUE (cotacao_item_id, cotacao_fornecedor_id),
  CONSTRAINT fcp_disponibilidade_check CHECK (
    (disponivel = false AND valor_unitario IS NULL AND valor_total IS NULL) OR
    (disponivel = true AND valor_unitario IS NOT NULL AND valor_total IS NOT NULL)
  )
);

DROP VIEW IF EXISTS financeiro_custo_por_fornecedor;
CREATE VIEW financeiro_custo_por_fornecedor
WITH (security_invoker = true) AS
SELECT
  it.materia_prima_id,
  l.parte_id,
  p.nome AS fornecedor_nome,
  SUM(it.quantidade * it.fator_conversao) AS quantidade_convertida,
  SUM(it.valor_total) AS valor_total,
  SUM(it.valor_total) / NULLIF(SUM(it.quantidade * it.fator_conversao), 0) AS custo_medio_por_unidade_medida,
  COUNT(*) AS numero_compras,
  MAX(l.data_lancamento) AS ultima_compra
FROM financeiro_lancamento_itens it
JOIN financeiro_lancamentos l ON l.id = it.lancamento_id
JOIN financeiro_partes p ON p.id = l.parte_id
WHERE l.status <> 'cancelado'
GROUP BY it.materia_prima_id, l.parte_id, p.nome;

CREATE OR REPLACE FUNCTION financeiro_cotacao_responder(
  p_cotacao_fornecedor_id UUID,
  p_precos JSONB
) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode responder cotações';
  END IF;

  INSERT INTO financeiro_cotacao_precos (cotacao_item_id, cotacao_fornecedor_id, valor_unitario, valor_total, disponivel)
  SELECT
    (x->>'cotacao_item_id')::UUID,
    p_cotacao_fornecedor_id,
    (x->>'valor_unitario')::NUMERIC,
    (x->>'valor_total')::NUMERIC,
    (x->>'disponivel')::BOOLEAN
  FROM jsonb_array_elements(p_precos) AS x
  ON CONFLICT (cotacao_item_id, cotacao_fornecedor_id)
  DO UPDATE SET
    valor_unitario = EXCLUDED.valor_unitario,
    valor_total = EXCLUDED.valor_total,
    disponivel = EXCLUDED.disponivel;

  UPDATE financeiro_cotacao_fornecedores
  SET status = 'respondido', respondido_em = now()
  WHERE id = p_cotacao_fornecedor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION financeiro_cotacao_responder TO authenticated;

ALTER TABLE financeiro_cotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_cotacao_precos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_cotacoes_select ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_select ON financeiro_cotacoes FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacoes_insert ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_insert ON financeiro_cotacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_cotacoes_update ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_update ON financeiro_cotacoes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacoes_delete_blocked ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_delete_blocked ON financeiro_cotacoes FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_itens_select ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_select ON financeiro_cotacao_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_insert ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_insert ON financeiro_cotacao_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_update ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_update ON financeiro_cotacao_itens FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_precos_select ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_select ON financeiro_cotacao_precos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_insert ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_insert ON financeiro_cotacao_precos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_update ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_update ON financeiro_cotacao_precos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_cotacao_precos_delete_blocked ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_delete_blocked ON financeiro_cotacao_precos FOR DELETE USING (false);

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_cotacao%';

-- ============================================================
-- 14. CMV / Ficha Técnica — matéria-prima → pré-preparo → produto final
--
-- Sem aninhamento (pré-preparo só usa matéria-prima — garantido pela
-- estrutura: financeiro_pre_preparo_itens nem tem coluna pra apontar pra
-- outro pré-preparo). Produto final combina matéria-prima e/ou
-- pré-preparo livremente, com rendimento_porcoes pra venda porcionada.
--
-- RLS admin-only até pra SELECT — dado de margem/custo, mesmo
-- tratamento de financeiro_cotacoes. As tabelas _itens não têm policy de
-- INSERT/UPDATE/DELETE — ficha técnica precisa ser editável (trocar
-- ingrediente, remover linha) mas DELETE é bloqueado em toda tabela
-- deste schema por design, então a escrita passa por uma função
-- SECURITY DEFINER que substitui o conjunto inteiro de linhas de uma vez
-- (mesmo padrão de financeiro_pdv_substituir_periodo).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS financeiro_pp_codigo_seq;
GRANT USAGE ON SEQUENCE financeiro_pp_codigo_seq TO authenticated;

CREATE TABLE IF NOT EXISTS financeiro_pre_preparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL DEFAULT ('PP-' || LPAD(nextval('financeiro_pp_codigo_seq')::text, 4, '0')),
  nome TEXT NOT NULL UNIQUE,
  unidade_medida TEXT NOT NULL, -- unidade do rendimento e do consumo quando usado num produto final, ex: 'g'
  rendimento_quantidade NUMERIC NOT NULL CHECK (rendimento_quantidade > 0), -- quanto a receita rende, em unidade_medida
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER SEQUENCE financeiro_pp_codigo_seq OWNED BY financeiro_pre_preparos.codigo;

CREATE TABLE IF NOT EXISTS financeiro_pre_preparo_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_preparo_id UUID NOT NULL REFERENCES financeiro_pre_preparos(id) ON DELETE CASCADE,
  materia_prima_id UUID NOT NULL REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0), -- na unidade_medida da matéria-prima
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pre_preparo_id, materia_prima_id)
);
CREATE INDEX IF NOT EXISTS idx_fppi_pre_preparo ON financeiro_pre_preparo_itens(pre_preparo_id);
CREATE INDEX IF NOT EXISTS idx_fppi_materia_prima ON financeiro_pre_preparo_itens(materia_prima_id);

CREATE TABLE IF NOT EXISTS financeiro_produtos_finais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  codigo_pdv_loja1 TEXT, -- código do cadastro de produtos do PDV (Paraisópolis) — manual por enquanto
  codigo_pdv_loja2 TEXT, -- idem, Itajubá — cada loja numera seu PDV de forma independente
  rendimento_porcoes INT NOT NULL DEFAULT 1 CHECK (rendimento_porcoes > 0),
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpf_codigo_pdv_loja1 ON financeiro_produtos_finais(codigo_pdv_loja1) WHERE codigo_pdv_loja1 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpf_codigo_pdv_loja2 ON financeiro_produtos_finais(codigo_pdv_loja2) WHERE codigo_pdv_loja2 IS NOT NULL;

CREATE TABLE IF NOT EXISTS financeiro_produto_final_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_final_id UUID NOT NULL REFERENCES financeiro_produtos_finais(id) ON DELETE CASCADE,
  materia_prima_id UUID REFERENCES financeiro_materias_primas(id) ON DELETE RESTRICT,
  pre_preparo_id UUID REFERENCES financeiro_pre_preparos(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (num_nonnulls(materia_prima_id, pre_preparo_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_fpfi_produto_final ON financeiro_produto_final_itens(produto_final_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_materia_prima ON financeiro_produto_final_itens(materia_prima_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_pre_preparo ON financeiro_produto_final_itens(pre_preparo_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_mp ON financeiro_produto_final_itens(produto_final_id, materia_prima_id) WHERE materia_prima_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_pp ON financeiro_produto_final_itens(produto_final_id, pre_preparo_id) WHERE pre_preparo_id IS NOT NULL;

ALTER TABLE financeiro_pre_preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_pre_preparo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produtos_finais ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produto_final_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_pre_preparos_select ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_select ON financeiro_pre_preparos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pre_preparos_insert ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_insert ON financeiro_pre_preparos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_pre_preparos_update ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_update ON financeiro_pre_preparos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_produtos_finais_select ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_select ON financeiro_produtos_finais FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produtos_finais_insert ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_insert ON financeiro_produtos_finais FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_produtos_finais_update ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_update ON financeiro_produtos_finais FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens;
CREATE POLICY financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_produto_final_itens_select ON financeiro_produto_final_itens;
CREATE POLICY financeiro_produto_final_itens_select ON financeiro_produto_final_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

CREATE OR REPLACE FUNCTION financeiro_pre_preparo_salvar_itens(p_pre_preparo_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar receitas';
  END IF;
  DELETE FROM financeiro_pre_preparo_itens WHERE pre_preparo_id = p_pre_preparo_id;
  INSERT INTO financeiro_pre_preparo_itens (pre_preparo_id, materia_prima_id, quantidade)
  SELECT p_pre_preparo_id, (i->>'materia_prima_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_pre_preparo_salvar_itens TO authenticated;

CREATE OR REPLACE FUNCTION financeiro_produto_final_salvar_itens(p_produto_final_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar receitas';
  END IF;
  DELETE FROM financeiro_produto_final_itens WHERE produto_final_id = p_produto_final_id;
  INSERT INTO financeiro_produto_final_itens (produto_final_id, materia_prima_id, pre_preparo_id, quantidade)
  SELECT p_produto_final_id, (i->>'materia_prima_id')::UUID, (i->>'pre_preparo_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_produto_final_salvar_itens TO authenticated;

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_pre_preparo%' OR tablename LIKE 'financeiro_produto_final%';

-- ============================================================
-- 16. Orçamento do mês — meta de venda + previsão de entrada de caixa por
-- dia da semana + saldo inicial + previsão manual de despesas, base da
-- visão mensal em calendário do Fluxo de Caixa.
--
-- Um registro por (ano, mes, unidade). Meta de venda, previsão de entrada
-- e saldo inicial são por loja (loja1/loja2 — só quem vende e tem conta
-- bancária própria); 'geral' é o balde único das despesas orçadas do mês
-- inteiro, tratando a empresa como uma unidade só (CHECK trava meta/
-- saldo/previsão fora das lojas).
--
-- Meta de venda e previsão de entrada são cadastradas à mão, por dia da
-- semana (7 colunas cada, dom-sáb) — não por média histórica automática,
-- ainda não há dado suficiente pra isso significar algo (ver
-- lib/migrations/reestrutura-orcamento-metas-semanais.sql). Índice de dia
-- da semana combina com Date.getDay() (0=domingo..6=sábado), igual
-- DIA_SEMANA_LABEL em components/FluxoMensalTabela.tsx.
--
-- financeiro_orcamento_itens não tem policy de INSERT/UPDATE/DELETE — é
-- um rascunho editável o mês inteiro, mas DELETE é bloqueado em toda
-- tabela deste schema por design. Resolvido com uma função SECURITY
-- DEFINER que substitui o conjunto inteiro de linhas (mesmo padrão de
-- financeiro_pre_preparo_itens).
-- ============================================================

CREATE TABLE IF NOT EXISTS financeiro_orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1','loja2','geral')),
  meta_venda_dom NUMERIC, meta_venda_seg NUMERIC, meta_venda_ter NUMERIC, meta_venda_qua NUMERIC,
  meta_venda_qui NUMERIC, meta_venda_sex NUMERIC, meta_venda_sab NUMERIC,
  entrada_prevista_dom NUMERIC, entrada_prevista_seg NUMERIC, entrada_prevista_ter NUMERIC, entrada_prevista_qua NUMERIC,
  entrada_prevista_qui NUMERIC, entrada_prevista_sex NUMERIC, entrada_prevista_sab NUMERIC,
  saldo_inicial NUMERIC, -- saldo bancário no início do mês; null = "não informado", nunca 0 por omissão
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (ano, mes, unidade),
  CONSTRAINT fo_meta_venda_positiva CHECK (
    (meta_venda_dom IS NULL OR meta_venda_dom > 0) AND (meta_venda_seg IS NULL OR meta_venda_seg > 0) AND
    (meta_venda_ter IS NULL OR meta_venda_ter > 0) AND (meta_venda_qua IS NULL OR meta_venda_qua > 0) AND
    (meta_venda_qui IS NULL OR meta_venda_qui > 0) AND (meta_venda_sex IS NULL OR meta_venda_sex > 0) AND
    (meta_venda_sab IS NULL OR meta_venda_sab > 0)
  ),
  CONSTRAINT fo_entrada_prevista_positiva CHECK (
    (entrada_prevista_dom IS NULL OR entrada_prevista_dom > 0) AND (entrada_prevista_seg IS NULL OR entrada_prevista_seg > 0) AND
    (entrada_prevista_ter IS NULL OR entrada_prevista_ter > 0) AND (entrada_prevista_qua IS NULL OR entrada_prevista_qua > 0) AND
    (entrada_prevista_qui IS NULL OR entrada_prevista_qui > 0) AND (entrada_prevista_sex IS NULL OR entrada_prevista_sex > 0) AND
    (entrada_prevista_sab IS NULL OR entrada_prevista_sab > 0)
  ),
  CONSTRAINT fo_meta_e_saldo_so_loja CHECK (
    unidade <> 'geral' OR (
      saldo_inicial IS NULL AND
      meta_venda_dom IS NULL AND meta_venda_seg IS NULL AND meta_venda_ter IS NULL AND
      meta_venda_qua IS NULL AND meta_venda_qui IS NULL AND meta_venda_sex IS NULL AND meta_venda_sab IS NULL AND
      entrada_prevista_dom IS NULL AND entrada_prevista_seg IS NULL AND entrada_prevista_ter IS NULL AND
      entrada_prevista_qua IS NULL AND entrada_prevista_qui IS NULL AND entrada_prevista_sex IS NULL AND entrada_prevista_sab IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS financeiro_orcamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES financeiro_orcamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa','compra_insumos')),
  parte_id UUID REFERENCES financeiro_partes(id),
  conta_id UUID REFERENCES financeiro_contas(id),
  valor_previsto NUMERIC NOT NULL CHECK (valor_previsto > 0),
  -- "Quando" da previsão — no máximo um dos dois preenchido, os dois
  -- juntos não fazem sentido:
  --  - dia_semana (0=domingo..6=sábado): valor_previsto é "por ocorrência"
  --    (ex: R$500 toda segunda), total do mês = valor × ocorrências.
  --  - data_especifica: previsão pontual numa data exata (ex: retirada de
  --    lucro no dia 25).
  -- Sem nenhum dos dois, valor_previsto é um total único do mês inteiro
  -- (sem projeção diária, só entra na comparação orçado x realizado).
  -- Com um dos dois, a previsão TAMBÉM é injetada nos dias futuros do
  -- calendário (Saídas) — e some sozinha quando o dia passa ou quando já
  -- existe nota/boleto real lançado pra mesma conta/fornecedor naquela
  -- data (evita duplicar).
  dia_semana INT CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  data_especifica DATE,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT foi_eixo_por_tipo CHECK (
    (tipo = 'despesa' AND conta_id IS NOT NULL) OR
    (tipo = 'compra_insumos' AND parte_id IS NOT NULL)
  ),
  CONSTRAINT foi_dia_ou_data_nao_ambos CHECK (dia_semana IS NULL OR data_especifica IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_foi_orcamento ON financeiro_orcamento_itens(orcamento_id);

ALTER TABLE financeiro_orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_orcamento_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financeiro_orcamentos_select ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_select ON financeiro_orcamentos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_orcamentos_insert ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_insert ON financeiro_orcamentos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_orcamentos_update ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_update ON financeiro_orcamentos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_orcamentos_delete_blocked ON financeiro_orcamentos;
CREATE POLICY financeiro_orcamentos_delete_blocked ON financeiro_orcamentos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_orcamento_itens_select ON financeiro_orcamento_itens;
CREATE POLICY financeiro_orcamento_itens_select ON financeiro_orcamento_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

CREATE OR REPLACE FUNCTION financeiro_orcamento_salvar_itens(p_orcamento_id UUID, p_itens JSONB) RETURNS void AS $$
BEGIN
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'apenas admin pode editar orçamento';
  END IF;
  DELETE FROM financeiro_orcamento_itens WHERE orcamento_id = p_orcamento_id;
  INSERT INTO financeiro_orcamento_itens (orcamento_id, tipo, parte_id, conta_id, valor_previsto, dia_semana, data_especifica, observacao)
  SELECT p_orcamento_id, i->>'tipo', (i->>'parte_id')::UUID, (i->>'conta_id')::UUID, (i->>'valor_previsto')::NUMERIC, (i->>'dia_semana')::INT, (i->>'data_especifica')::DATE, i->>'observacao'
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_orcamento_salvar_itens TO authenticated;

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_orcamento%';
