-- Fase 4 — Estoque: motivo da baixa + fechamento do dia (inventário diário)
-- 06/11/2026
--
-- O QUE FAZ
--   1) movimentacoes_estoque.motivo: por que a etiqueta saiu (venda, consumo,
--      vencido, quebra, degustacao, uso_interno). Nulo nos registros antigos.
--   2) Índices para as consultas novas (adesão, perdas, baixa por quantidade).
--   3) estoque_config: por loja, liga/desliga o BLOQUEIO do fechamento do dia,
--      hora de corte (padrão 18:00) e dias da semana sem exigência.
--      NASCE DESLIGADO — o admin liga no sistema (Estoque > Ações).
--   4) estoque_fechamentos + estoque_fechamento_itens: o registro de cada
--      contagem diária (esperado x contado x baixado, por produto).
--   5) estoque_fechamento_status(): decide, com o relógio do SERVIDOR (fuso
--      America/Sao_Paulo), se a loja está com o fechamento pendente.
--   6) view estoque_baixas_por_dia: baixas por loja/dia/motivo (exclui as que
--      foram revertidas) — alimenta "perdas por motivo".
--
-- ORDEM: rode este SQL ANTES de publicar o front da Fase 4 (o front passa a
-- gravar `motivo` e a ler as tabelas novas).
-- Pré-requisito: já existirem usuario_ativo() e usuario_eh_admin()
-- (seguranca-fechar-acesso-anonimo.sql e seguranca-hotfix-usuarios-recursao.sql).

begin;

-- 1) motivo da baixa ---------------------------------------------------------
alter table public.movimentacoes_estoque add column if not exists motivo text;
alter table public.movimentacoes_estoque drop constraint if exists movimentacoes_estoque_motivo_check;
alter table public.movimentacoes_estoque
  add constraint movimentacoes_estoque_motivo_check
  check (motivo is null or motivo in ('venda', 'consumo', 'vencido', 'quebra', 'degustacao', 'uso_interno'));

-- 2) índices -----------------------------------------------------------------
create index if not exists movimentacoes_estoque_origem_data_idx
  on public.movimentacoes_estoque (local_origem, created_at desc);
create index if not exists movimentacoes_estoque_estornado_idx
  on public.movimentacoes_estoque (estornado_de) where estornado_de is not null;
create index if not exists lotes_producao_status_destino_idx
  on public.lotes_producao (status, destino, data_validade);

-- 3) configuração do bloqueio -------------------------------------------------
create table if not exists public.estoque_config (
  local text primary key check (local in ('loja1', 'loja2')),
  bloqueio_ativo boolean not null default false,
  hora_corte time not null default '18:00',
  -- 0 = domingo ... 6 = sábado (mesma convenção do extract(dow ...)). Dia listado aqui não exige fechamento.
  dias_sem_exigencia int[] not null default '{}',
  atualizado_por uuid references public.usuarios (id),
  updated_at timestamptz not null default now()
);
insert into public.estoque_config (local) values ('loja1'), ('loja2') on conflict (local) do nothing;

-- 4) fechamento do dia ---------------------------------------------------------
create table if not exists public.estoque_fechamentos (
  id uuid primary key default gen_random_uuid(),
  local text not null check (local in ('loja1', 'loja2')),
  data date not null, -- dia do fechamento (America/Sao_Paulo)
  criado_por uuid not null references public.usuarios (id),
  criado_por_nome text not null,
  dispensado boolean not null default false, -- admin liberou a loja sem contagem
  motivo_dispensa text,
  total_itens int not null default 0, -- produtos contados
  total_baixado int not null default 0, -- etiquetas baixadas por diferença
  created_at timestamptz not null default now()
);
create index if not exists estoque_fechamentos_local_data_idx on public.estoque_fechamentos (local, data desc);

create table if not exists public.estoque_fechamento_itens (
  id uuid primary key default gen_random_uuid(),
  fechamento_id uuid not null references public.estoque_fechamentos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id),
  esperado int not null, -- etiquetas no sistema na hora da contagem
  contado int not null, -- o que a funcionária contou
  baixado int not null default 0, -- etiquetas baixadas (esperado > contado)
  excedente int not null default 0, -- contado > esperado (não cria etiqueta; só registra)
  motivo text check (motivo is null or motivo in ('venda', 'consumo', 'vencido', 'quebra', 'degustacao', 'uso_interno'))
);
create index if not exists estoque_fechamento_itens_fech_idx on public.estoque_fechamento_itens (fechamento_id);

-- RLS: mesmo padrão das tabelas operacionais (somente logado e ativo); config só o admin altera.
alter table public.estoque_config enable row level security;
alter table public.estoque_fechamentos enable row level security;
alter table public.estoque_fechamento_itens enable row level security;

drop policy if exists "estoque_config_select" on public.estoque_config;
create policy "estoque_config_select" on public.estoque_config
  for select to authenticated using ((select public.usuario_ativo()));
drop policy if exists "estoque_config_admin_update" on public.estoque_config;
create policy "estoque_config_admin_update" on public.estoque_config
  for update to authenticated
  using ((select public.usuario_eh_admin())) with check ((select public.usuario_eh_admin()));
drop policy if exists "estoque_config_admin_insert" on public.estoque_config;
create policy "estoque_config_admin_insert" on public.estoque_config
  for insert to authenticated with check ((select public.usuario_eh_admin()));

drop policy if exists "estoque_fechamentos_select" on public.estoque_fechamentos;
create policy "estoque_fechamentos_select" on public.estoque_fechamentos
  for select to authenticated using ((select public.usuario_ativo()));
drop policy if exists "estoque_fechamentos_insert" on public.estoque_fechamentos;
create policy "estoque_fechamentos_insert" on public.estoque_fechamentos
  for insert to authenticated
  with check ((select public.usuario_ativo()) and criado_por = auth.uid());
drop policy if exists "estoque_fechamentos_admin_delete" on public.estoque_fechamentos;
create policy "estoque_fechamentos_admin_delete" on public.estoque_fechamentos
  for delete to authenticated using ((select public.usuario_eh_admin()));

drop policy if exists "estoque_fechamento_itens_select" on public.estoque_fechamento_itens;
create policy "estoque_fechamento_itens_select" on public.estoque_fechamento_itens
  for select to authenticated using ((select public.usuario_ativo()));
drop policy if exists "estoque_fechamento_itens_insert" on public.estoque_fechamento_itens;
create policy "estoque_fechamento_itens_insert" on public.estoque_fechamento_itens
  for insert to authenticated with check ((select public.usuario_ativo()));
drop policy if exists "estoque_fechamento_itens_admin_delete" on public.estoque_fechamento_itens;
create policy "estoque_fechamento_itens_admin_delete" on public.estoque_fechamento_itens
  for delete to authenticated using ((select public.usuario_eh_admin()));

revoke all on public.estoque_config, public.estoque_fechamentos, public.estoque_fechamento_itens from anon;

-- 5) o fechamento está pendente? (relógio do servidor, não do tablet) --------------
-- Regra: depois da hora de corte, o dia de HOJE precisa de fechamento; antes dela, a
-- exigência é a de ONTEM (continua bloqueando de manhã quem deixou pendente). Dias da
-- semana listados em dias_sem_exigencia são pulados. Só exige se há etiqueta na
-- prateleira da loja (nada a contar = nada a exigir). Um fechamento feito no dia
-- exigido OU depois dele vale.
create or replace function public.estoque_fechamento_status(p_local text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  cfg public.estoque_config%rowtype;
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  exigida date;
  tentativas int := 0;
  tem_estoque boolean;
  feito boolean;
begin
  select * into cfg from public.estoque_config where local = p_local;
  if not found then
    return jsonb_build_object('pendente', false, 'bloqueio_ativo', false);
  end if;

  exigida := case when agora::time >= cfg.hora_corte then agora::date else agora::date - 1 end;
  while extract(dow from exigida)::int = any (cfg.dias_sem_exigencia) and tentativas < 7 loop
    exigida := exigida - 1;
    tentativas := tentativas + 1;
  end loop;
  if tentativas >= 7 then
    return jsonb_build_object('pendente', false, 'bloqueio_ativo', cfg.bloqueio_ativo);
  end if;

  select exists (select 1 from public.lotes_producao where destino = p_local and status = 'na_loja') into tem_estoque;
  select exists (select 1 from public.estoque_fechamentos where local = p_local and data >= exigida) into feito;

  return jsonb_build_object(
    'pendente', (tem_estoque and not feito),
    'bloqueio_ativo', cfg.bloqueio_ativo,
    'data_exigida', exigida,
    'hora_corte', cfg.hora_corte
  );
end;
$$;
revoke all on function public.estoque_fechamento_status(text) from public, anon;
grant execute on function public.estoque_fechamento_status(text) to authenticated;

-- 6) baixas por loja/dia/motivo (sem as revertidas) ----------------------------------
create or replace view public.estoque_baixas_por_dia with (security_invoker = true) as
select
  m.local_origem as local,
  (m.created_at at time zone 'America/Sao_Paulo')::date as dia,
  m.motivo,
  sum(m.quantidade)::int as quantidade
from public.movimentacoes_estoque m
where m.tipo = 'saida'
  and not exists (select 1 from public.movimentacoes_estoque e where e.estornado_de = m.id)
group by 1, 2, 3;
revoke all on public.estoque_baixas_por_dia from anon;
grant select on public.estoque_baixas_por_dia to authenticated;

commit;

-- VERIFICAÇÃO -----------------------------------------------------------------------
select local, bloqueio_ativo, hora_corte, dias_sem_exigencia from public.estoque_config order by local;
select public.estoque_fechamento_status('loja2') as status_loja2;
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'movimentacoes_estoque' and column_name = 'motivo';

-- ROLLBACK ---------------------------------------------------------------------------
-- begin;
-- drop view if exists public.estoque_baixas_por_dia;
-- drop function if exists public.estoque_fechamento_status(text);
-- drop table if exists public.estoque_fechamento_itens;
-- drop table if exists public.estoque_fechamentos;
-- drop table if exists public.estoque_config;
-- alter table public.movimentacoes_estoque drop constraint if exists movimentacoes_estoque_motivo_check;
-- alter table public.movimentacoes_estoque drop column if exists motivo;
-- commit;
