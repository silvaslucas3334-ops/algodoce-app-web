-- HOTFIX (06/11/2026) — "infinite recursion detected in policy for relation usuarios"
--
-- SINTOMA: depois de rodar seguranca-fechar-acesso-anonimo.sql, salvar uma
-- alteração em Admin > Usuários (inclusive o botão "Liberar") falha com
-- "infinite recursion detected in policy for relation "usuarios"".
--
-- CAUSA: as policies antigas "Admin pode atualizar" / "Admin pode deletar"
-- fazem um SELECT dentro da própria tabela `usuarios` para descobrir se quem
-- chama é admin. Enquanto a policy de SELECT era só `true` isso funcionava.
-- A policy de SELECT nova que eu criei usava `(select usuario_ativo())`, que o
-- Postgres trata como sub-consulta e, ao expandir a policy dentro de outra
-- policy da mesma tabela, acusa recursão.
--
-- CORREÇÃO (sem recursão, por construção):
--   1) a policy de SELECT passa a chamar a função direto, sem `(select ...)`;
--   2) o teste de "é admin" vira uma função SECURITY DEFINER (usuario_eh_admin),
--      e as policies de UPDATE/DELETE passam a usar a função em vez de uma
--      sub-consulta em `usuarios`. Nenhuma policy de `usuarios` consulta mais
--      a própria tabela.
--
-- É seguro rodar mais de uma vez.

begin;

create or replace function public.usuario_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.role = 'admin' and u.ativo is distinct from false
  );
$$;

revoke all on function public.usuario_eh_admin() from public, anon;
grant execute on function public.usuario_eh_admin() to authenticated;

-- 1) SELECT sem sub-consulta
drop policy if exists "usuarios_select_proprio_ou_ativo" on public.usuarios;
create policy "usuarios_select_proprio_ou_ativo" on public.usuarios
  for select to authenticated
  using (id = auth.uid() or public.usuario_ativo());

-- 2) UPDATE / DELETE de admin via função
drop policy if exists "Admin pode atualizar" on public.usuarios;
create policy "Admin pode atualizar" on public.usuarios
  for update to authenticated
  using (public.usuario_eh_admin())
  with check (public.usuario_eh_admin());

drop policy if exists "Admin pode deletar" on public.usuarios;
create policy "Admin pode deletar" on public.usuarios
  for delete to authenticated
  using (public.usuario_eh_admin());

commit;

-- Verificação: nenhuma policy de usuarios deve conter "FROM usuarios"
select policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'usuarios'
order by policyname;

-- ROLLBACK (volta às policies de antes do hotfix — só se necessário; elas
-- reintroduzem o erro de recursão):
-- begin;
-- drop policy if exists "Admin pode atualizar" on public.usuarios;
-- drop policy if exists "Admin pode deletar" on public.usuarios;
-- create policy "Admin pode atualizar" on public.usuarios for update to public
--   using ((select u.role from usuarios u where u.id = auth.uid()) = 'admin');
-- create policy "Admin pode deletar" on public.usuarios for delete to public
--   using ((select u.role from usuarios u where u.id = auth.uid()) = 'admin');
-- commit;
