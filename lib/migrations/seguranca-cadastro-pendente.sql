-- Cadastro "pendente" — Fase 0 do plano de segurança (05/11/2026)
--
-- PROBLEMA: o /signup (público) criava a linha em `usuarios` direto do
-- navegador, com a função (role) escolhida no formulário e a policy
-- "Qualquer um pode inserir" liberada. Quem chamasse a API direto podia se
-- cadastrar como admin. Além disso, `usuarios.ativo` nunca foi checado por
-- ninguém (era só um selo na tela).
--
-- SOLUÇÃO: a linha passa a ser criada AQUI, no servidor, por um trigger em
-- auth.users: sempre `ativo = false`, função 'loja', sem loja. O front novo
-- (components/AccessGate.tsx) só deixa entrar quem estiver `ativo = true`, e o
-- admin libera em Admin > Usuários (botão "Liberar", que também define
-- função e loja).
--
-- ORDEM DE PUBLICAÇÃO (importante):
--   1) rodar o PASSO 0 e conferir a lista;
--   2) rodar os PASSOS 1 e 2 neste SQL Editor;
--   3) só então publicar o front novo.
-- (Se o front novo sair antes do trigger, cadastros novos ficam sem linha em
-- `usuarios` e o login responde "Usuário não encontrado na base de dados".)
--
-- Contas criadas direto no painel do Supabase (Authentication > Users)
-- também passam a ganhar a linha pendente automaticamente — é só liberar no
-- sistema depois.

-- PASSO 0 — quem hoje NÃO está ativo? Essas pessoas passam a ser barradas
-- pelo front novo. Se alguém aqui deveria continuar entrando, ative-o antes
-- (Admin > Usuários > Editar > "Usuário ativo") ou com o UPDATE abaixo.
select id, nome, email, role, loja_id, ativo
from usuarios
where ativo is distinct from true
order by created_at;

-- (opcional) linhas antigas com ativo nulo: tratar como ativas
-- update usuarios set ativo = true where ativo is null;

-- PASSO 1 — função do trigger (roda como dono, ignora RLS; não é chamável pela API)
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nome, role, loja_id, ativo)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    'loja',
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- PASSO 2 — trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Verificação: o trigger existe?
select tgname, tgenabled from pg_trigger where tgname = 'on_auth_user_created';

-- ROLLBACK (se precisar voltar ao comportamento antigo):
-- drop trigger if exists on_auth_user_created on auth.users;
-- drop function if exists public.handle_new_auth_user();
