-- Fechar o acesso anônimo — Fase 0 (passo 0.5) do plano de segurança (05/11/2026)
--
-- ESTADO ENCONTRADO (consulta em pg_policies, 05/11/2026):
--   * lotes_producao, movimentacoes_estoque, ordens_producao, produtos:
--       policy "acesso_total" (ALL, USING true) para o papel PUBLIC → inclui
--       `anon`. A chave pública do site lê e escreve essas tabelas sem login.
--   * usuarios: SELECT liberado a todos ("Todos podem ver") e INSERT livre
--       ("Qualquer um pode inserir") → lista e-mails/papéis de qualquer um e
--       permite se auto-cadastrar com a função que quiser.
--   * setores: SELECT público.
--
-- O QUE ESTE SCRIPT FAZ:
--   1) cria usuario_ativo() — verdadeiro só para sessão logada cuja linha em
--      `usuarios` não está com ativo = false (é o que faz o "pendente" valer
--      de verdade, não só na tela);
--   2) troca as policies abertas por "somente logado e ativo";
--   3) remove o INSERT livre em `usuarios` (a linha agora nasce pelo trigger
--      de lib/migrations/seguranca-cadastro-pendente.sql);
--   4) tira o EXECUTE do `anon`/PUBLIC de TODA função SECURITY DEFINER do
--      schema public (ex.: financeiro_pdv_substituir_periodo/_excluir_periodo)
--      e devolve só ao papel `authenticated`.
--
-- PRÉ-REQUISITOS (não rode antes):
--   [ ] seguranca-cadastro-pendente.sql já executado
--   [ ] front novo (AccessGate + /signup sem insert) já publicado
--   [ ] todos os funcionários que precisam entrar estão com ativo = true
--   [ ] ter uma conta de cada papel (admin, loja, cozinha) para testar logo
--       depois, e este arquivo aberto com o ROLLBACK no final
--
-- EFEITO COLATERAL CONHECIDO: o "modo teste" do hooks/useAuth.ts (só em
-- desenvolvimento, usuário fake sem login) deixa de enxergar dados. Para
-- testar localmente passa a ser preciso entrar com uma conta real.
--
-- Rode em horário de pouco uso. Os blocos são independentes; se algo falhar
-- no meio, use o ROLLBACK correspondente.

begin;

-- 1) função de apoio -------------------------------------------------------
create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.ativo is distinct from false
  );
$$;

revoke all on function public.usuario_ativo() from public, anon;
grant execute on function public.usuario_ativo() to authenticated;

-- 2) tabelas operacionais: só logado e ativo --------------------------------
-- (select usuario_ativo()) faz o Postgres avaliar a função uma vez por
-- consulta, não uma vez por linha.
drop policy if exists "acesso_total" on public.lotes_producao;
create policy "acesso_autenticado_ativo" on public.lotes_producao
  for all to authenticated
  using ((select public.usuario_ativo()))
  with check ((select public.usuario_ativo()));

drop policy if exists "acesso_total" on public.movimentacoes_estoque;
create policy "acesso_autenticado_ativo" on public.movimentacoes_estoque
  for all to authenticated
  using ((select public.usuario_ativo()))
  with check ((select public.usuario_ativo()));

drop policy if exists "acesso_total" on public.ordens_producao;
create policy "acesso_autenticado_ativo" on public.ordens_producao
  for all to authenticated
  using ((select public.usuario_ativo()))
  with check ((select public.usuario_ativo()));

drop policy if exists "acesso_total" on public.produtos;
create policy "acesso_autenticado_ativo" on public.produtos
  for all to authenticated
  using ((select public.usuario_ativo()))
  with check ((select public.usuario_ativo()));

-- 3) usuarios --------------------------------------------------------------
-- Cada um enxerga a própria linha (o AccessGate precisa dela, inclusive para
-- quem está pendente); os demais, só depois de ativo (nomes de colegas são
-- usados em Tarefas, Ordens e no painel).
-- ATENÇÃO: aqui NÃO usar `(select public.usuario_ativo())`. As policies antigas
-- "Admin pode atualizar/deletar" consultam a própria tabela `usuarios`; uma
-- sub-consulta na policy de SELECT faz o Postgres acusar "infinite recursion
-- detected in policy for relation usuarios" ao salvar um usuário. Corrigido em
-- seguranca-hotfix-usuarios-recursao.sql (que também troca o teste de admin por
-- uma função). Se for rodar este arquivo do zero, rode o hotfix logo depois.
drop policy if exists "Todos podem ver" on public.usuarios;
create policy "usuarios_select_proprio_ou_ativo" on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.usuario_ativo());

-- A linha nasce pelo trigger (security definer); não existe mais insert do cliente.
drop policy if exists "Qualquer um pode inserir" on public.usuarios;

-- 4) setores ---------------------------------------------------------------
drop policy if exists "setores_select_authenticated" on public.setores;
create policy "setores_select_authenticated" on public.setores
  for select to authenticated
  using ((select public.usuario_ativo()));

-- 5) funções SECURITY DEFINER: nada de anon ---------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

commit;

-- VERIFICAÇÃO (rode depois e confira) ----------------------------------------
-- (a) não deve sobrar policy aberta a anon nas tabelas acima:
select tablename, policyname, cmd, roles::text
from pg_policies
where schemaname = 'public'
  and tablename in ('lotes_producao','movimentacoes_estoque','ordens_producao','produtos','usuarios','setores')
order by tablename, policyname;
-- (b) nenhuma função SECURITY DEFINER executável por anon:
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_executa
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by 2 desc, 1;

-- TESTE RÁPIDO NO SITE: entrar como admin, loja e cozinha e abrir Início,
-- Estoque, Expedição, Ordens, Tarefas e Financeiro (admin). Uma conta
-- pendente deve ver só "Aguardando liberação".

-- ROLLBACK (volta exatamente ao estado de antes) ------------------------------
-- begin;
-- drop policy if exists "acesso_autenticado_ativo" on public.lotes_producao;
-- drop policy if exists "acesso_autenticado_ativo" on public.movimentacoes_estoque;
-- drop policy if exists "acesso_autenticado_ativo" on public.ordens_producao;
-- drop policy if exists "acesso_autenticado_ativo" on public.produtos;
-- create policy "acesso_total" on public.lotes_producao for all to public using (true);
-- create policy "acesso_total" on public.movimentacoes_estoque for all to public using (true);
-- create policy "acesso_total" on public.ordens_producao for all to public using (true);
-- create policy "acesso_total" on public.produtos for all to public using (true);
-- drop policy if exists "usuarios_select_proprio_ou_ativo" on public.usuarios;
-- create policy "Todos podem ver" on public.usuarios for select to public using (true);
-- create policy "Qualquer um pode inserir" on public.usuarios for insert to public with check (true);
-- drop policy if exists "setores_select_authenticated" on public.setores;
-- create policy "setores_select_authenticated" on public.setores for select to public using (true);
-- -- (as funções SECURITY DEFINER: para devolver o EXECUTE ao anon, se necessário:)
-- -- grant execute on function <nome>(<args>) to anon;
-- commit;
