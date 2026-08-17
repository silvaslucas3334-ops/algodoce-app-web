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
  -- false = conta de reserva/provisão (aplicação financeira, ativo fixo
  -- etc.) — aportes lançados nela não entram no DRE como despesa, só saem
  -- do caixa disponível (ver lib/migrations/financeiro-aplicacao-reserva-dre.sql).
  afeta_dre BOOLEAN NOT NULL DEFAULT true,
  -- seção da cascata do DRE reestruturado (ver lib/migrations/financeiro-dre-cascata.sql)
  -- — nullable de propósito: conta sem classificação cai num balde "Não
  -- classificado" na tela em vez de sumir silenciosamente. Distinto de
  -- grupo_dre (texto livre, usado só pra agrupar exibição).
  linha_dre TEXT CHECK (linha_dre IS NULL OR linha_dre IN
    ('deducao_vendas', 'cmv', 'mao_obra_encargos', 'despesas_operacionais', 'resultado_financeiro', 'distribuicao_lucros')),
  -- false = o dinheiro já sai antes de chegar no banco (ex: Taxa de Cartão,
  -- Comissão de Delivery, contas 2003/2004) — despesa nela já nasce
  -- liquidada, sem evento de contas a pagar/fluxo de caixa. Propriedade da
  -- conta, não escolha livre do usuário na hora de lançar (ver
  -- lib/migrations/financeiro-contas-afeta-fluxo-caixa.sql).
  afeta_fluxo_caixa BOOLEAN NOT NULL DEFAULT true,
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
  -- Nota: 3002 vira afeta_dre=false logo abaixo — é a conta de reserva
  -- (aplicação financeira p/ 13º, férias etc.), não uma despesa real.
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

UPDATE financeiro_contas SET afeta_dre = false WHERE codigo = '3002';
UPDATE financeiro_contas SET afeta_fluxo_caixa = false WHERE codigo IN ('2003', '2004');

UPDATE financeiro_contas SET linha_dre = 'cmv'                   WHERE codigo IN ('1001', '1002', '1004');
UPDATE financeiro_contas SET linha_dre = 'mao_obra_encargos'     WHERE codigo IN ('1003', '1005');
UPDATE financeiro_contas SET linha_dre = 'despesas_operacionais' WHERE codigo IN ('1006', '1007', '2002', '2006', '3006');
UPDATE financeiro_contas SET linha_dre = 'deducao_vendas'        WHERE codigo IN ('2001', '2003', '2004', '2005');
UPDATE financeiro_contas SET linha_dre = 'resultado_financeiro'  WHERE codigo IN ('3001', '3002', '3003', '3005');
UPDATE financeiro_contas SET linha_dre = 'distribuicao_lucros'   WHERE codigo = '3004';

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
  -- Unidade em que o fornecedor vende (ex: pacote de 5kg) — só usada pra
  -- calcular quantos pacotes pedir no PDF da cotação e pro preço digitado
  -- no mesmo formato do fornecedor; nunca entra em custo/CMV (isso
  -- continua só via unidade_compra/fator_conversao). Ambos opcionais.
  unidade_fornecedor TEXT,
  fator_unidade_fornecedor NUMERIC CHECK (fator_unidade_fornecedor IS NULL OR fator_unidade_fornecedor > 0), -- unidade_compra por 1 unidade_fornecedor (1 pacote=5kg -> 5)
  -- Custo manual por unidade_compra pra itens sem histórico de compra no
  -- sistema (ex: sal, azeite comprados antes desse módulo existir). IS NOT
  -- NULL é o próprio toggle; quando preenchido, sempre tem prioridade sobre
  -- o custo calculado (ver lib/financeiro-cmv.ts). Convertido pra custo por
  -- unidade_medida via fator_conversao, igual valor_unitario da nota.
  custo_manual_por_unidade_compra NUMERIC CHECK (custo_manual_por_unidade_compra IS NULL OR custo_manual_por_unidade_compra >= 0),
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

-- 4.1 financeiro_ofx_contas_conhecidas — aprendizado fingerprint -> loja,
--     pra avisar quando o toggle "Loja deste extrato" divergir do que já
--     foi confirmado antes pra aquela conta (ver lib/ofx.ts, fingerprintOFX).
CREATE TABLE IF NOT EXISTS financeiro_ofx_contas_conhecidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  conta_bancaria TEXT NOT NULL,
  bank_id TEXT,
  acct_id TEXT,
  cnpj TEXT,
  aprendido_por UUID NOT NULL REFERENCES usuarios(id),
  aprendido_em TIMESTAMPTZ DEFAULT now()
);

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
  -- Início/fim da recorrência: fim opcional (NULL = sem fim definido, gera
  -- indefinidamente enquanto ativa). Guiam gerar_lancamentos_recorrentes()
  -- pra nunca gerar além do previsto.
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
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
  -- Diferença entre o valor lançado e o valor realmente pago (juros/multa
  -- por atraso), aplicada via conciliação manual — nunca embutida em
  -- silêncio dentro de valor_total. Ver lib/migrations/financeiro-conciliacao-manual.sql.
  valor_juros_multa NUMERIC DEFAULT 0,
  -- Soma dos débitos bancários já conciliados quando a despesa é paga em
  -- mais de uma vez (saldo insuficiente pro valor total de uma vez só).
  -- status continua 'aberto' enquanto valor_pago_conciliado < valor_total —
  -- "parcialmente paga" é estado derivado, não persistido. Ver
  -- lib/migrations/financeiro-conciliacao-parcial.sql.
  valor_pago_conciliado NUMERIC NOT NULL DEFAULT 0,
  -- false = "não-caixa": entra no DRE por competência, mas nunca gera
  -- evento de contas a pagar/fluxo de caixa — o dinheiro já saiu antes de
  -- chegar no banco (ex: Taxa de Cartão/Comissão de Delivery, contas
  -- 2004/2003, lançadas manualmente pelo valor global do mês). Ver
  -- lib/migrations/financeiro-lancamento-nao-caixa.sql.
  afeta_fluxo_caixa BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  -- Recado rápido entre os admins que mexem no financeiro, pra coordenar
  -- prioridade de pagamento (não é o workflow de pagamento — isso é
  -- `status`). Sem RLS própria: o UPDATE de financeiro_lancamentos já
  -- permite qualquer admin editar qualquer lançamento.
  etiqueta_aprovacao TEXT CHECK (etiqueta_aprovacao IN ('planejar_pagamento', 'aprovada_pagamento') OR etiqueta_aprovacao IS NULL),
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
-- Índice NÃO-único de propósito: várias despesas podem apontar pra mesma
-- transação de extrato (ex: fornecedor com várias entregas pagas de uma vez
-- só — conciliação manual, ver lib/financeiro-reconciliacao.ts). A proteção
-- original contra vínculo duplicado por race condition (INSERT do
-- lançamento sucede, UPDATE de vínculo seguinte falha, retry duplica) agora
-- é responsabilidade da aplicação (guarda por estado esperado + contagem de
-- linhas afetadas). Ver lib/migrations/financeiro-conciliacao-manual.sql.
CREATE INDEX IF NOT EXISTS idx_fl_extrato_transacao_id
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

-- lancamentos: admin tudo; loja/cozinha só o que ela mesma lançou (não a
-- unidade inteira — despesa lançada por outra pessoa da mesma unidade pode
-- ser salário/retirada de sócio, informação confidencial que não é pra
-- circular entre a equipe). Edição também só em aberto.
DROP POLICY IF EXISTS financeiro_lancamentos_select ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_select ON financeiro_lancamentos FOR SELECT TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR criado_por = auth.uid()
  );
-- CRIAÇÃO liberada pra qualquer unidade, pra qualquer role — várias
-- pessoas de unidades diferentes lançam despesa/nota. A EDIÇÃO (abaixo)
-- continua travada por criador pra não-admin.
DROP POLICY IF EXISTS financeiro_lancamentos_insert ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_insert ON financeiro_lancamentos FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_lancamentos_update ON financeiro_lancamentos;
CREATE POLICY financeiro_lancamentos_update ON financeiro_lancamentos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (criado_por = auth.uid() AND status = 'aberto')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR (criado_por = auth.uid() AND status = 'aberto')
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
          OR l.criado_por = auth.uid()
        )
    )
  );
-- INSERT não trava por status nem por unidade: criar os itens é parte do
-- mesmo fluxo atômico de lançar a nota (mesma liberação do pai acima) —
-- só a UPDATE (editar item depois) trava em status='aberto' + unidade.
-- Admin também precisa poder ACRESCENTAR item numa nota criada por outra
-- pessoa (ex: corrigir NF depois) — sem esse bypass só o criado_por original
-- conseguia inserir item, mesmo sendo admin.
DROP POLICY IF EXISTS financeiro_lancamento_itens_insert ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_insert ON financeiro_lancamento_itens FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR EXISTS (SELECT 1 FROM financeiro_lancamentos l WHERE l.id = lancamento_id AND l.criado_por = auth.uid())
  );
DROP POLICY IF EXISTS financeiro_lancamento_itens_update ON financeiro_lancamento_itens;
CREATE POLICY financeiro_lancamento_itens_update ON financeiro_lancamento_itens FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM financeiro_lancamentos l
      WHERE l.id = lancamento_id
        AND (
          (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
          OR (l.criado_por = auth.uid() AND l.status = 'aberto')
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
-- DELETE: admin pode reverter um upload feito pra loja errada, mas só
-- enquanto a linha ainda estiver 'pendente' (ver reverter-importacao-ofx.sql).
DROP POLICY IF EXISTS financeiro_extrato_transacoes_delete_blocked ON financeiro_extrato_transacoes;
CREATE POLICY financeiro_extrato_transacoes_delete_admin_pendente ON financeiro_extrato_transacoes FOR DELETE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    AND status_conciliacao = 'pendente'
  );

-- Extrato é admin-only (acima), mas o Fluxo de Caixa (loja/cozinha também
-- veem) precisa saber quando cada pagamento PARCIAL de uma despesa saiu de
-- verdade, pra não mascarar Saídas/Saldo — essa function devolve só
-- (lancamento_id, data, valor) já conciliados, nunca a linha crua do
-- extrato. Ver lib/migrations/financeiro-extrato-por-lancamentos-rpc.sql.
CREATE OR REPLACE FUNCTION financeiro_extrato_por_lancamentos(p_lancamento_ids UUID[])
RETURNS TABLE (lancamento_id UUID, data DATE, valor NUMERIC) AS $$
  SELECT lancamento_id, data, ABS(valor) AS valor
  FROM financeiro_extrato_transacoes
  WHERE status_conciliacao = 'conciliado'
    AND lancamento_id = ANY(p_lancamento_ids);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION financeiro_extrato_por_lancamentos(UUID[]) TO authenticated;
  );

-- financeiro_ofx_contas_conhecidas: só admin, mesmo padrão do extrato.
-- DELETE fica bloqueado — mapeamento errado se autocorrige via upsert.
ALTER TABLE financeiro_ofx_contas_conhecidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_select ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_select ON financeiro_ofx_contas_conhecidas FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_insert ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_insert ON financeiro_ofx_contas_conhecidas FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_update ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_update ON financeiro_ofx_contas_conhecidas FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');
DROP POLICY IF EXISTS financeiro_ofx_contas_conhecidas_delete_blocked ON financeiro_ofx_contas_conhecidas;
CREATE POLICY financeiro_ofx_contas_conhecidas_delete_blocked ON financeiro_ofx_contas_conhecidas FOR DELETE USING (false);

-- ============================================================
-- 10. Geração automática das despesas recorrentes (pg_cron)
-- ============================================================
-- Mudou de RETURNS void pra RETURNS INT (quantas despesas foram criadas) —
-- exige DROP antes do CREATE (Postgres não deixa REPLACE mudar tipo de retorno).
DROP FUNCTION IF EXISTS gerar_lancamentos_recorrentes();
CREATE FUNCTION gerar_lancamentos_recorrentes() RETURNS INT AS $$
DECLARE
  rec RECORD;
  hoje_sp DATE;
  prox DATE;
  guarda INT;
  criadas INT := 0;
BEGIN
  hoje_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  FOR rec IN
    SELECT * FROM financeiro_recorrencias WHERE ativa AND proxima_data <= hoje_sp
  LOOP
    prox := rec.proxima_data;
    guarda := 0;

    -- Laço com trava (guarda < 60 = 5 anos de teto): sem isso, uma
    -- recorrência esquecida por meses só alcançaria o mês atual rodando o
    -- cron um dia de cada vez. Com o laço, uma chamada só já coloca em dia
    -- (respeitando data_fim, nunca gera além do previsto).
    WHILE prox <= hoje_sp AND (rec.data_fim IS NULL OR prox <= rec.data_fim) AND guarda < 60 LOOP
      guarda := guarda + 1;

      INSERT INTO financeiro_lancamentos (
        tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento, data_competencia,
        status, forma_pagamento, condicao_pagamento, unidade, conta_id,
        recorrencia_id, criado_por
      ) VALUES (
        'despesa', rec.parte_id, rec.descricao, rec.valor, prox, prox,
        (date_trunc('month', prox) - (rec.competencia_deslocamento_meses || ' months')::interval)::date,
        'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id,
        rec.id, rec.criado_por
      );
      criadas := criadas + 1;

      prox := (date_trunc('month', prox) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date;
    END LOOP;

    UPDATE financeiro_recorrencias
    SET proxima_data = prox,
        -- Desativa sozinha quando passa do fim definido — não fica gerando pra sempre por engano.
        ativa = NOT (rec.data_fim IS NOT NULL AND prox > rec.data_fim),
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;

  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recorrência não depende mais de automação por tempo (cron) — ao criar,
-- gera todas as ocorrências até data_fim na hora (ver despesas/nova/page.tsx),
-- visíveis/editáveis por qualquer um desde o primeiro minuto. Essa função
-- gera TODAS as ocorrências de uma recorrência de uma vez, sem checar "hoje"
-- (diferente de gerar_lancamentos_recorrentes() acima, que só alcança o
-- presente) — é o que resolve o problema de visibilidade.
CREATE OR REPLACE FUNCTION gerar_ocorrencias_recorrencia(p_recorrencia_id UUID) RETURNS INT AS $$
DECLARE
  rec RECORD;
  prox DATE;
  guarda INT := 0;
  criadas INT := 0;
BEGIN
  SELECT * INTO rec FROM financeiro_recorrencias WHERE id = p_recorrencia_id AND ativa;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF rec.data_fim IS NULL THEN
    RAISE EXCEPTION 'Recorrência sem data_fim — não é possível gerar ocorrências sem um limite.';
  END IF;

  prox := rec.proxima_data;
  WHILE prox <= rec.data_fim AND guarda < 60 LOOP
    guarda := guarda + 1;
    INSERT INTO financeiro_lancamentos (
      tipo, parte_id, descricao, valor_total, data_lancamento, data_vencimento, data_competencia,
      status, forma_pagamento, condicao_pagamento, unidade, conta_id, recorrencia_id, criado_por
    ) VALUES (
      'despesa', rec.parte_id, rec.descricao, rec.valor, prox, prox,
      (date_trunc('month', prox) - (rec.competencia_deslocamento_meses || ' months')::interval)::date,
      'aberto', rec.forma_pagamento, 'a_vista', rec.unidade, rec.conta_id, rec.id, rec.criado_por
    );
    criadas := criadas + 1;
    prox := (date_trunc('month', prox) + INTERVAL '1 month' + (rec.dia_vencimento - 1) * INTERVAL '1 day')::date;
  END LOOP;

  -- Tudo já foi gerado — não sobra nada pra nenhum processo automático fazer depois.
  UPDATE financeiro_recorrencias SET proxima_data = prox, ativa = false, updated_at = now() WHERE id = rec.id;
  RETURN criadas;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- gerar_lancamentos_recorrentes() fica definida (útil como utilitário manual
-- de catch-up), mas sem agendamento — nenhuma geração deve acontecer sozinha
-- com o passar do tempo. unschedule dentro de DO$$ evita erro se o job nunca
-- tiver existido (instalação limpa) ou já estiver desagendado.
DO $$ BEGIN
  PERFORM cron.unschedule('gerar-lancamentos-recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

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
  -- 'resgate_aplicacao' = resgate de uma conta de reserva (afeta_dre=false
  -- em financeiro_contas) — não é venda, fica fora da Receita Bruta do DRE.
  categoria TEXT NOT NULL CHECK (categoria IN ('venda_cartao', 'pix', 'dinheiro', 'repasse_ifood', 'repasse_aiqfome', 'outros', 'resgate_aplicacao')),
  data DATE NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  -- Opcional. NUNCA substitui `valor` (que continua sendo sempre o
  -- líquido que bateu no extrato) — só o DRE lê valor_bruto, pra calcular
  -- a taxa de cartão/app (venda_cartao, repasse_ifood, repasse_aiqfome)
  -- como diferença, sem nunca virar lançamento em financeiro_lancamentos.
  valor_bruto NUMERIC CHECK (valor_bruto IS NULL OR valor_bruto >= valor),
  observacao TEXT,
  extrato_transacao_id UUID REFERENCES financeiro_extrato_transacoes(id),
  -- Só preenchido quando categoria='resgate_aplicacao' — de qual conta de
  -- reserva veio o resgate (ver lib/migrations/financeiro-aplicacao-reserva-dre.sql).
  conta_id UUID REFERENCES financeiro_contas(id),
  criado_por UUID NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT fr_extrato_dinheiro_check CHECK (
    (categoria = 'dinheiro' AND extrato_transacao_id IS NULL) OR
    (categoria <> 'dinheiro' AND extrato_transacao_id IS NOT NULL)
  ),
  CONSTRAINT fr_resgate_conta_check CHECK (
    (categoria = 'resgate_aplicacao' AND conta_id IS NOT NULL) OR
    (categoria <> 'resgate_aplicacao' AND conta_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fr_extrato_transacao_unico
  ON financeiro_receitas(extrato_transacao_id) WHERE extrato_transacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fr_unidade_data ON financeiro_receitas(unidade, data);
CREATE INDEX IF NOT EXISTS idx_fr_conta ON financeiro_receitas(conta_id) WHERE conta_id IS NOT NULL;

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
  -- 'fornecedores' = RFQ tradicional (pede preço a N fornecedores, compara,
  -- fecha com o vencedor). 'estimativa' = lista de compra à vista pra UM
  -- fornecedor só (ex: supermercado) — preço auto-estimado a partir do
  -- histórico (lib/financeiro-cotacoes.ts: estimarPrecosCotacao), sem
  -- pedido formal nem resposta manual; serve de orçamento prévio +
  -- checklist físico de compra.
  tipo TEXT NOT NULL DEFAULT 'fornecedores' CHECK (tipo IN ('fornecedores', 'estimativa')),
  -- Só pré-preenche a unidade da nota ao fechar — NÃO é usada para RLS
  -- (diferente de financeiro_lancamentos.unidade, que escopa
  -- financeiro_unidade_do_usuario()). Cotações é colaborativo: qualquer
  -- role (admin/loja/cozinha) cria/edita — lojas criam a cotação, admin
  -- centraliza e formaliza o pedido a partir do resultado.
  unidade TEXT NOT NULL CHECK (unidade IN ('loja1', 'loja2', 'rateio')),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'cancelada')),
  fornecedor_vencedor_id UUID REFERENCES financeiro_partes(id),
  -- Prazo pedido ao fornecedor (não é uma promessa dele) — definido na
  -- criação, impresso no PDF que sai antes de qualquer resposta.
  data_entrega_planejada DATE,
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
  comprado BOOLEAN NOT NULL DEFAULT false, -- checklist físico de compra (marcado durante a compra) — vale pros dois tipos de cotação
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
  -- unidade_medida por 1 unidade_cotacao, conforme ESSE fornecedor — só
  -- preenchido quando a embalagem dele difere do padrão cadastrado em
  -- financeiro_materias_primas.fator_conversao (ex: caixa com menos
  -- unidades). NULL = usa o padrão da matéria-prima. Sem isso, "valor por
  -- cx" de dois fornecedores com caixas de tamanhos diferentes (ex: 300 un
  -- x 100 un) seria comparado como se fossem a mesma coisa.
  fator_conversao_fornecedor NUMERIC CHECK (fator_conversao_fornecedor IS NULL OR fator_conversao_fornecedor > 0),
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
  IF (SELECT role FROM usuarios WHERE id = auth.uid()) NOT IN ('admin', 'loja', 'cozinha') THEN
    RAISE EXCEPTION 'apenas usuário autenticado do sistema pode responder cotações';
  END IF;

  INSERT INTO financeiro_cotacao_precos (cotacao_item_id, cotacao_fornecedor_id, valor_unitario, valor_total, disponivel, fator_conversao_fornecedor)
  SELECT
    (x->>'cotacao_item_id')::UUID,
    p_cotacao_fornecedor_id,
    (x->>'valor_unitario')::NUMERIC,
    (x->>'valor_total')::NUMERIC,
    (x->>'disponivel')::BOOLEAN,
    (x->>'fator_conversao_fornecedor')::NUMERIC
  FROM jsonb_array_elements(p_precos) AS x
  ON CONFLICT (cotacao_item_id, cotacao_fornecedor_id)
  DO UPDATE SET
    valor_unitario = EXCLUDED.valor_unitario,
    valor_total = EXCLUDED.valor_total,
    disponivel = EXCLUDED.disponivel,
    fator_conversao_fornecedor = EXCLUDED.fator_conversao_fornecedor;

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
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacoes_insert ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_insert ON financeiro_cotacoes FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha') AND criado_por = auth.uid());
DROP POLICY IF EXISTS financeiro_cotacoes_update ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_update ON financeiro_cotacoes FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacoes_delete_blocked ON financeiro_cotacoes;
CREATE POLICY financeiro_cotacoes_delete_blocked ON financeiro_cotacoes FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_itens_select ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_select ON financeiro_cotacao_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_itens_insert ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_insert ON financeiro_cotacao_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_itens_update ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_update ON financeiro_cotacao_itens FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
-- Diferente das outras 3 tabelas do módulo (fornecedores/preços seguem
-- bloqueados) — remover um item errado da lista antes de fechar é uma
-- correção legítima (edição geral de cotação aberta); depois de fechada,
-- os itens viram histórico e o DELETE volta a ficar bloqueado.
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete_blocked ON financeiro_cotacao_itens;
DROP POLICY IF EXISTS financeiro_cotacao_itens_delete ON financeiro_cotacao_itens;
CREATE POLICY financeiro_cotacao_itens_delete ON financeiro_cotacao_itens FOR DELETE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha')
    AND EXISTS (SELECT 1 FROM financeiro_cotacoes c WHERE c.id = cotacao_id AND c.status = 'aberta')
  );

DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_select ON financeiro_cotacao_fornecedores FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_insert ON financeiro_cotacao_fornecedores FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_update ON financeiro_cotacao_fornecedores FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores;
CREATE POLICY financeiro_cotacao_fornecedores_delete_blocked ON financeiro_cotacao_fornecedores FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_cotacao_precos_select ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_select ON financeiro_cotacao_precos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_precos_insert ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_insert ON financeiro_cotacao_precos FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
DROP POLICY IF EXISTS financeiro_cotacao_precos_update ON financeiro_cotacao_precos;
CREATE POLICY financeiro_cotacao_precos_update ON financeiro_cotacao_precos FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'))
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'loja', 'cozinha'));
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
-- SELECT liberado pra admin + cozinha (dado de margem/custo visível pra
-- cozinha por decisão consciente — ela precisa ver tudo pra montar receita
-- nova). Escrita: admin cria/edita direto como 'aprovado'; cozinha só cria/
-- edita como 'pendente_revisao' (coluna `status`), até um admin aprovar.
-- As tabelas _itens não têm policy de INSERT/UPDATE/DELETE — ficha técnica
-- precisa ser editável (trocar ingrediente, remover linha) mas DELETE é
-- bloqueado em toda tabela deste schema por design, então a escrita passa
-- por uma função SECURITY DEFINER que substitui o conjunto inteiro de
-- linhas de uma vez (mesmo padrão de financeiro_pdv_substituir_periodo),
-- também travada por status quando quem chama é cozinha.
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
  -- 'pendente_revisao' quando criado/editado pela cozinha, até um admin
  -- aprovar; admin cria/edita direto como 'aprovado'.
  status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('aprovado', 'pendente_revisao')),
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
  status TEXT NOT NULL DEFAULT 'aprovado' CHECK (status IN ('aprovado', 'pendente_revisao')),
  -- true = este produto pode ser usado como item (componente) dentro de
  -- outro produto final, tipo um combo. Hierarquia travada em 1 nível por
  -- trigger (ver financeiro_valida_hierarquizacao_produto_final abaixo).
  permite_hierarquizacao BOOLEAN NOT NULL DEFAULT false,
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
  -- outro produto final usado como componente (combo) — ver
  -- lib/migrations/financeiro-produto-final-hierarquizacao.sql.
  produto_final_componente_id UUID REFERENCES financeiro_produtos_finais(id) ON DELETE RESTRICT,
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT financeiro_produto_final_itens_um_tipo_check
    CHECK (num_nonnulls(materia_prima_id, pre_preparo_id, produto_final_componente_id) = 1)
);
CREATE INDEX IF NOT EXISTS idx_fpfi_produto_final ON financeiro_produto_final_itens(produto_final_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_materia_prima ON financeiro_produto_final_itens(materia_prima_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_pre_preparo ON financeiro_produto_final_itens(pre_preparo_id);
CREATE INDEX IF NOT EXISTS idx_fpfi_produto_final_componente ON financeiro_produto_final_itens(produto_final_componente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_mp ON financeiro_produto_final_itens(produto_final_id, materia_prima_id) WHERE materia_prima_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_pp ON financeiro_produto_final_itens(produto_final_id, pre_preparo_id) WHERE pre_preparo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fpfi_unico_pfc ON financeiro_produto_final_itens(produto_final_id, produto_final_componente_id) WHERE produto_final_componente_id IS NOT NULL;

-- Trigger de validação — hierarquia travada em 1 nível: um combo não pode
-- conter outro combo, e um produto já usado como componente não pode virar
-- combo também. Roda em QUALQUER insert/update na tabela (não só pela RPC
-- financeiro_produto_final_salvar_itens), então nenhum caminho de escrita
-- consegue burlar.
CREATE OR REPLACE FUNCTION financeiro_valida_hierarquizacao_produto_final() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.produto_final_componente_id IS NOT NULL THEN
    IF NEW.produto_final_componente_id = NEW.produto_final_id THEN
      RAISE EXCEPTION 'um produto final não pode se referenciar como componente de si mesmo';
    END IF;
    IF EXISTS (
      SELECT 1 FROM financeiro_produto_final_itens
      WHERE produto_final_id = NEW.produto_final_componente_id AND produto_final_componente_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'este produto já é um combo — não pode ser usado como componente de outro combo (hierarquia limitada a 1 nível)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM financeiro_produto_final_itens
      WHERE produto_final_componente_id = NEW.produto_final_id
    ) THEN
      RAISE EXCEPTION 'este produto já é componente de um combo — não pode virar um combo também (hierarquia limitada a 1 nível)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_valida_hierarquizacao_produto_final ON financeiro_produto_final_itens;
CREATE TRIGGER trg_valida_hierarquizacao_produto_final
  BEFORE INSERT OR UPDATE ON financeiro_produto_final_itens
  FOR EACH ROW EXECUTE FUNCTION financeiro_valida_hierarquizacao_produto_final();

ALTER TABLE financeiro_pre_preparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_pre_preparo_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produtos_finais ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_produto_final_itens ENABLE ROW LEVEL SECURITY;

-- SELECT liberado pra admin + cozinha: cozinha precisa ver tudo (inclusive
-- custo/margem) pra montar receita nova referenciando pré-preparos/insumos
-- existentes — sem isso o módulo fica inutilizável pra ela.
DROP POLICY IF EXISTS financeiro_pre_preparos_select ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_select ON financeiro_pre_preparos FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));
-- Cozinha só insere como 'pendente_revisao'; admin insere qualquer status.
DROP POLICY IF EXISTS financeiro_pre_preparos_insert ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_insert ON financeiro_pre_preparos FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
    )
  );
-- Admin edita/aprova qualquer linha; cozinha só linhas ainda
-- pendente_revisao (time compartilhado, sem trava por criador).
DROP POLICY IF EXISTS financeiro_pre_preparos_update ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_update ON financeiro_pre_preparos FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  );
DROP POLICY IF EXISTS financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos;
CREATE POLICY financeiro_pre_preparos_delete_blocked ON financeiro_pre_preparos FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_produtos_finais_select ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_select ON financeiro_produtos_finais FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));
DROP POLICY IF EXISTS financeiro_produtos_finais_insert ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_insert ON financeiro_produtos_finais FOR INSERT TO authenticated
  WITH CHECK (
    criado_por = auth.uid()
    AND (
      (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
      OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
    )
  );
DROP POLICY IF EXISTS financeiro_produtos_finais_update ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_update ON financeiro_produtos_finais FOR UPDATE TO authenticated
  USING (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  )
  WITH CHECK (
    (SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin'
    OR ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'cozinha' AND status = 'pendente_revisao')
  );
DROP POLICY IF EXISTS financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais;
CREATE POLICY financeiro_produtos_finais_delete_blocked ON financeiro_produtos_finais FOR DELETE USING (false);

DROP POLICY IF EXISTS financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens;
CREATE POLICY financeiro_pre_preparo_itens_select ON financeiro_pre_preparo_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));
DROP POLICY IF EXISTS financeiro_produto_final_itens_select ON financeiro_produto_final_itens;
CREATE POLICY financeiro_produto_final_itens_select ON financeiro_produto_final_itens FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));

-- Aceita admin e cozinha; cozinha só mexe em itens de linha pai ainda
-- pendente de revisão.
CREATE OR REPLACE FUNCTION financeiro_pre_preparo_salvar_itens(p_pre_preparo_id UUID, p_itens JSONB) RETURNS void AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT role INTO v_role FROM usuarios WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'cozinha') THEN
    RAISE EXCEPTION 'apenas admin ou cozinha pode editar receitas';
  END IF;
  IF v_role = 'cozinha' THEN
    SELECT status INTO v_status FROM financeiro_pre_preparos WHERE id = p_pre_preparo_id;
    IF v_status IS DISTINCT FROM 'pendente_revisao' THEN
      RAISE EXCEPTION 'cozinha só pode editar itens de pré-preparo pendente de revisão';
    END IF;
  END IF;
  DELETE FROM financeiro_pre_preparo_itens WHERE pre_preparo_id = p_pre_preparo_id;
  INSERT INTO financeiro_pre_preparo_itens (pre_preparo_id, materia_prima_id, quantidade)
  SELECT p_pre_preparo_id, (i->>'materia_prima_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_pre_preparo_salvar_itens TO authenticated;

CREATE OR REPLACE FUNCTION financeiro_produto_final_salvar_itens(p_produto_final_id UUID, p_itens JSONB) RETURNS void AS $$
DECLARE
  v_role TEXT;
  v_status TEXT;
BEGIN
  SELECT role INTO v_role FROM usuarios WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'cozinha') THEN
    RAISE EXCEPTION 'apenas admin ou cozinha pode editar receitas';
  END IF;
  IF v_role = 'cozinha' THEN
    SELECT status INTO v_status FROM financeiro_produtos_finais WHERE id = p_produto_final_id;
    IF v_status IS DISTINCT FROM 'pendente_revisao' THEN
      RAISE EXCEPTION 'cozinha só pode editar itens de produto final pendente de revisão';
    END IF;
  END IF;
  DELETE FROM financeiro_produto_final_itens WHERE produto_final_id = p_produto_final_id;
  INSERT INTO financeiro_produto_final_itens (produto_final_id, materia_prima_id, pre_preparo_id, produto_final_componente_id, quantidade)
  SELECT p_produto_final_id, (i->>'materia_prima_id')::UUID, (i->>'pre_preparo_id')::UUID, (i->>'produto_final_componente_id')::UUID, (i->>'quantidade')::NUMERIC
  FROM jsonb_array_elements(p_itens) AS i;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION financeiro_produto_final_salvar_itens TO authenticated;

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'financeiro_pre_preparo%' OR tablename LIKE 'financeiro_produto_final%';

-- ============================================================
-- 16.1 Precificação: markup (custo -> preço ideal) + margem de
-- contribuição (custo + preço praticado -> quanto sobra). Ver
-- lib/financeiro-precificacao.ts. Config é uma linha só, global —
-- despesas variáveis/custos fixos são realidade do negócio como um todo;
-- só a margem de lucro alvo varia por produto (override em
-- financeiro_produtos_finais, fallback pro padrão daqui).
-- Ver lib/migrations/financeiro-precificacao.sql (mirror aqui).
-- ============================================================
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
CREATE POLICY financeiro_config_precificacao_select ON financeiro_config_precificacao FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) IN ('admin', 'cozinha'));
DROP POLICY IF EXISTS financeiro_config_precificacao_update ON financeiro_config_precificacao;
CREATE POLICY financeiro_config_precificacao_update ON financeiro_config_precificacao FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

ALTER TABLE financeiro_produtos_finais
  ADD COLUMN IF NOT EXISTS preco_venda NUMERIC,
  ADD COLUMN IF NOT EXISTS margem_lucro_desejada_pct NUMERIC;

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

-- ============================================================
-- 17. Faturamento diário manual — conteúdo idêntico ao de
-- lib/migrations/criar-financeiro-faturamento-diario.sql, replicado aqui
-- pra esse arquivo continuar sendo a fonte única de instalação limpa.
--
-- Uma linha por (unidade, data), uma coluna por forma de pagamento
-- (vocabulário de CategoriaReceita, sem 'outros'). Alimenta só a linha
-- "Faturamento"/"Meta de Venda" do Fluxo de Caixa (ver buscarFaturamentoLoja
-- em lib/financeiro-fluxo-mensal.ts) — nunca vira Entrada de Caixa real
-- (financeiro_receitas continua sendo a única fonte disso, via conciliação
-- de extrato ou o lançamento manual de dinheiro já existente). A linha
-- existir já significa "dia fechado": todas as colunas podem ser 0 sem
-- isso ser "não informado".
-- ============================================================

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

DROP POLICY IF EXISTS financeiro_faturamento_diario_select ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_select ON financeiro_faturamento_diario FOR SELECT TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_faturamento_diario_insert ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_insert ON financeiro_faturamento_diario FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin' AND criado_por = auth.uid());

DROP POLICY IF EXISTS financeiro_faturamento_diario_update ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_update ON financeiro_faturamento_diario FOR UPDATE TO authenticated
  USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS financeiro_faturamento_diario_delete_blocked ON financeiro_faturamento_diario;
CREATE POLICY financeiro_faturamento_diario_delete_blocked ON financeiro_faturamento_diario FOR DELETE USING (false);

SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'financeiro_faturamento_diario';
