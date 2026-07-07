-- Corrige 3 alertas CRÍTICOS do Security Advisor do Supabase:
-- romaneios, categorias e tarefas_notificacoes estavam com RLS desabilitado,
-- ou seja, qualquer pessoa com a URL do projeto podia ler/editar/apagar esses dados
-- direto pela API, sem precisar estar logada no app.
-- Execute no Supabase SQL Editor

-- ============================================================
-- 1. romaneios
--    Já existem policies de insert/update/select para "authenticated",
--    mas RLS nunca foi habilitado na tabela (por isso as policies eram
--    ignoradas). Faltava também uma policy de delete (usada em "Cancelar
--    romaneio"). Agora que a criação/cancelamento de romaneio passa a ser
--    feita direto pelo cliente autenticado (antes ia por uma rota de API
--    que usava a chave anônima sem repassar o login do usuário), habilitar
--    RLS aqui não quebra o fluxo.
-- ============================================================
ALTER TABLE romaneios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Qualquer autenticado delete romaneios" ON romaneios;
CREATE POLICY "Qualquer autenticado delete romaneios" ON romaneios
FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. categorias
--    Sem nenhuma policy hoje. Leitura é necessária para todo mundo logado
--    (telas de produtos, ordens, relatórios etc). Escrita (criar/editar/
--    excluir categoria) fica restrita a admin, como já é feito na tela
--    app/admin/categorias.tsx.
-- ============================================================
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categorias_select_qualquer ON categorias;
CREATE POLICY categorias_select_qualquer ON categorias
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS categorias_write_admin ON categorias;
CREATE POLICY categorias_write_admin ON categorias
FOR ALL TO authenticated
USING ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin')
WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- 3. tarefas_notificacoes
--    Sem nenhuma policy hoje (tabela criada nesta sessão junto com a
--    funcionalidade de "gestor conclui tarefa em nome do colaborador").
--    Cada usuário só pode ver/marcar como lida a PRÓPRIA notificação.
--    Só admin pode criar notificação (é o único fluxo que insere: quando
--    o gestor conclui uma tarefa atrasada em nome de outra pessoa).
-- ============================================================
ALTER TABLE tarefas_notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notificacoes_select_own ON tarefas_notificacoes;
CREATE POLICY notificacoes_select_own ON tarefas_notificacoes
FOR SELECT TO authenticated USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS notificacoes_insert_admin ON tarefas_notificacoes;
CREATE POLICY notificacoes_insert_admin ON tarefas_notificacoes
FOR INSERT TO authenticated
WITH CHECK ((SELECT role FROM usuarios WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS notificacoes_update_own ON tarefas_notificacoes;
CREATE POLICY notificacoes_update_own ON tarefas_notificacoes
FOR UPDATE TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (usuario_id = auth.uid());

-- ============================================================
-- Verificação: todas as 3 tabelas devem aparecer com rowsecurity = true,
-- e cada uma com as policies esperadas.
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('romaneios', 'categorias', 'tarefas_notificacoes');

SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE tablename IN ('romaneios', 'categorias', 'tarefas_notificacoes')
ORDER BY tablename, cmd;
