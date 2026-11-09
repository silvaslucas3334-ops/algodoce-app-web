-- Fase 8b — Ficha do produto: histórico de movimentações (kardex) (09/11/2026)
--
-- O QUE FAZ
--   1) estoque_kardex(produto, inicio, fim, unidade, limite, deslocamento): movimentações de UM
--      produto no período (dia no fuso de São Paulo), da mais recente para a mais antiga, já
--      com a etiqueta, o motivo, quem fez e se é um estorno (ou foi estornada). Devolve também o
--      total de linhas do período (total_linhas) para a paginação. Opcionalmente só as que
--      saem ou entram numa unidade ('cozinha' | 'loja1' | 'loja2').
--      A movimentação guarda a etiqueta (lote), não o produto — por isso o join com lotes_producao.
--   2) estoque_kardex_resumo(produto, inicio, fim, unidade): contagens do período (em etiquetas):
--      entradas registradas (sem estornos), transferências, baixas efetivas (sem as estornadas),
--      vendas, perdas (vencido + quebra) e estornos.
--
-- SEGURANÇA
--   * Só leitura. security invoker: respeita a RLS de quem consulta. Revogado de anon.
--   * Não altera nenhuma tabela nem dado existente.
--
-- ORDEM: rode ANTES de publicar o front da 8b. Seguro rodar mais de uma vez.

begin;

create or replace function public.estoque_kardex(
  p_produto uuid,
  p_inicio date,
  p_fim date,
  p_unidade text default null,
  p_limite int default 50,
  p_deslocamento int default 0
)
returns table (
  id uuid,
  em timestamptz,
  tipo text,
  local_origem text,
  local_destino text,
  quantidade numeric,
  motivo text,
  justificativa text,
  registrado_por text,
  codigo_qr text,
  estorno boolean,
  estornado boolean,
  total_linhas bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    m.created_at::timestamptz as em,
    m.tipo::text,
    m.local_origem::text,
    m.local_destino::text,
    m.quantidade::numeric,
    m.motivo::text,
    m.justificativa::text,
    m.registrado_por::text,
    l.codigo_qr::text,
    (m.estornado_de is not null) as estorno,
    exists (select 1 from public.movimentacoes_estoque e where e.estornado_de = m.id) as estornado,
    count(*) over () as total_linhas
  from public.movimentacoes_estoque m
  join public.lotes_producao l on l.id = m.lote_id
  where l.produto_id = p_produto
    and (m.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
    and (p_unidade is null or m.local_origem = p_unidade or m.local_destino = p_unidade)
  order by m.created_at desc, m.id
  limit greatest(p_limite, 1) offset greatest(p_deslocamento, 0)
$$;

create or replace function public.estoque_kardex_resumo(
  p_produto uuid,
  p_inicio date,
  p_fim date,
  p_unidade text default null
)
returns table (
  entradas int,
  transferencias int,
  baixas int,
  vendas int,
  perdas int,
  estornos int
)
language sql
stable
security invoker
set search_path = public
as $$
  with mov as (
    select
      m.tipo,
      m.motivo,
      (m.estornado_de is not null) as estorno,
      exists (select 1 from public.movimentacoes_estoque e where e.estornado_de = m.id) as estornado
    from public.movimentacoes_estoque m
    join public.lotes_producao l on l.id = m.lote_id
    where l.produto_id = p_produto
      and (m.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and (p_unidade is null or m.local_origem = p_unidade or m.local_destino = p_unidade)
  )
  select
    (count(*) filter (where tipo = 'entrada' and not estorno))::int,
    (count(*) filter (where tipo = 'transferencia'))::int,
    (count(*) filter (where tipo = 'saida' and not estornado))::int,
    (count(*) filter (where tipo = 'saida' and motivo = 'venda' and not estornado))::int,
    (count(*) filter (where tipo = 'saida' and motivo in ('vencido', 'quebra') and not estornado))::int,
    (count(*) filter (where estorno))::int
  from mov
$$;

revoke all on function public.estoque_kardex(uuid, date, date, text, int, int) from public, anon;
grant execute on function public.estoque_kardex(uuid, date, date, text, int, int) to authenticated;
revoke all on function public.estoque_kardex_resumo(uuid, date, date, text) from public, anon;
grant execute on function public.estoque_kardex_resumo(uuid, date, date, text) to authenticated;

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
-- Últimas movimentações de um produto qualquer com histórico (troque o nome se quiser):
select em, tipo, local_origem, local_destino, motivo, registrado_por, codigo_qr, estorno, estornado, total_linhas
from public.estoque_kardex(
  (select p.id from public.produtos p where p.nome ilike 'Pão de Ervas%' limit 1),
  current_date - 30, current_date, null, 10, 0
);

select * from public.estoque_kardex_resumo(
  (select p.id from public.produtos p where p.nome ilike 'Pão de Ervas%' limit 1),
  current_date - 30, current_date, null
);

-- ROLLBACK ------------------------------------------------------------------------------------
-- drop function if exists public.estoque_kardex_resumo(uuid, date, date, text);
-- drop function if exists public.estoque_kardex(uuid, date, date, text, int, int);
