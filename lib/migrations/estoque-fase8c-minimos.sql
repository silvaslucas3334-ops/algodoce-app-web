-- Fase 8c — Estoque mínimo por produto × unidade (09/11/2026)
--
-- O QUE FAZ
--   Tabela estoque_minimos: o mínimo de ETIQUETAS DISPONÍVEIS que o admin quer manter de cada
--   produto em cada unidade ('cozinha' | 'loja1' | 'loja2'). A Posição de Estoque compara o
--   disponível com este mínimo e marca "abaixo do mínimo" (etiqueta a caminho NÃO conta como
--   disponível). Produto sem linha aqui = sem mínimo definido (não gera alerta).
--
-- SEGURANÇA
--   * Só o admin lê e altera (RLS com usuario_eh_admin()). Revogado de anon.
--   * Tabela nova: não altera nenhuma tabela nem dado existente.
--
-- ORDEM: rode ANTES de publicar o front da 8c. Seguro rodar mais de uma vez.

begin;

create table if not exists public.estoque_minimos (
  produto_id uuid not null references public.produtos (id) on delete cascade,
  unidade text not null check (unidade in ('cozinha', 'loja1', 'loja2')),
  minimo int not null check (minimo >= 0),
  atualizado_por uuid,
  atualizado_em timestamptz not null default now(),
  primary key (produto_id, unidade)
);

alter table public.estoque_minimos enable row level security;

drop policy if exists "estoque_minimos_admin" on public.estoque_minimos;
create policy "estoque_minimos_admin" on public.estoque_minimos
  for all to authenticated
  using ((select public.usuario_eh_admin()))
  with check ((select public.usuario_eh_admin()));

revoke all on public.estoque_minimos from anon;
grant select, insert, update, delete on public.estoque_minimos to authenticated;

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
select count(*) as minimos_cadastrados from public.estoque_minimos;
select policyname, cmd from pg_policies where tablename = 'estoque_minimos';

-- ROLLBACK ------------------------------------------------------------------------------------
-- drop table if exists public.estoque_minimos;
