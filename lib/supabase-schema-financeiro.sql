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
  unidade_compra TEXT NOT NULL,  -- unidade usual de compra, ex: 'kg', 'caixa', 'un'
  fator_conversao NUMERIC NOT NULL CHECK (fator_conversao > 0), -- unidade_medida por 1 unidade_compra (1kg=1000g -> 1000)
  conta_id UUID REFERENCES financeiro_contas(id), -- classificação contábil padrão do item; itens da nota herdam
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.unidade = financeiro_unidade_do_usuario() AND l.status = 'aberto')
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
DROP POLICY IF EXISTS financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_delete_blocked ON financeiro_lancamento_itens FOR DELETE USING (false);

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
      tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento,
      status, forma_pagamento, condicao_pagamento, unidade, conta_id,
      recorrencia_id, criado_por
    ) VALUES (
      'despesa', rec.parte_id, rec.descricao, rec.valor, rec.proxima_data, rec.proxima_data,
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
  WHERE unidade = p_unidade AND data_abertura::date BETWEEN p_data_min AND p_data_max;
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

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_pdv_%';
