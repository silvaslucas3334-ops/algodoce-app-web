-- Fase 5 — módulo Compras: visões e funções (09/11/2026)
--
-- O QUE FAZ
--   1) financeiro_compras_itens_v: cada item de nota de compra, já com fornecedor,
--      insumo, quantidade convertida e preço por unidade de medida. Permite filtrar
--      e paginar no servidor (o relatório antigo buscava "por lista de ids de notas",
--      que estoura o tamanho da URL e o teto de 1000 linhas).
--   2) financeiro_compras_por_insumo(...): uma linha por insumo no período, com gasto,
--      preço médio, último preço, preço da compra anterior, variação % e fornecedor
--      principal.
--   3) financeiro_compras_sem_item(...): despesas em contas de insumo SEM item cadastrado
--      (ex.: "item não catalogado como matéria-prima") — invisíveis no módulo Compras.
--   4) financeiro_custo_atual_mp: último custo médio mensal por insumo (DISTINCT ON).
--      Substitui a leitura da view mensal inteira (que passa de 1000 linhas e corta
--      insumos em silêncio) em buscarCustosAtuaisMateriasPrimas.
--   5) índice (tipo, data_lancamento) para os filtros por período.
--
-- Tudo security_invoker: respeita a RLS de quem consulta (admin vê tudo; loja/cozinha só
-- a própria unidade). Preços normalizados em UNIDADE DE MEDIDA (g/ml/un); a tela
-- multiplica por fator_unidade_compra para mostrar por unidade de compra (R$/kg...).
--
-- ORDEM: rode ANTES de publicar o front da Fase 5. Seguro rodar mais de uma vez.

begin;

create index if not exists financeiro_lancamentos_tipo_data_idx
  on public.financeiro_lancamentos (tipo, data_lancamento) where status <> 'cancelado';

-- 1) itens de compra, planos ----------------------------------------------------------
create or replace view public.financeiro_compras_itens_v with (security_invoker = true) as
select
  it.id,
  it.lancamento_id,
  l.data_lancamento,
  l.parte_id,
  p.nome as fornecedor_nome,
  l.numero_documento,
  l.descricao as nota_descricao,
  it.materia_prima_id,
  mp.nome as materia_prima_nome,
  mp.unidade_medida,
  mp.unidade_compra,
  mp.fator_conversao as fator_unidade_compra,
  it.quantidade,
  it.unidade_nota,
  it.fator_conversao,
  (it.quantidade * it.fator_conversao) as quantidade_convertida,
  it.valor_unitario,
  it.valor_total,
  (it.valor_total / nullif(it.quantidade * it.fator_conversao, 0)) as preco_por_unidade_medida
from public.financeiro_lancamento_itens it
join public.financeiro_lancamentos l on l.id = it.lancamento_id
join public.financeiro_partes p on p.id = l.parte_id
join public.financeiro_materias_primas mp on mp.id = it.materia_prima_id
where l.status <> 'cancelado';

-- 2) resumo por insumo no período --------------------------------------------------------
-- "Último preço" e "compra anterior" olham o histórico ATÉ o fim do período (não só dentro
-- dele); se p_parte for informado, valem só para aquele fornecedor.
create or replace function public.financeiro_compras_por_insumo(
  p_inicio date,
  p_fim date,
  p_parte uuid default null,
  p_busca text default null
)
returns table (
  materia_prima_id uuid,
  nome text,
  unidade_medida text,
  unidade_compra text,
  fator_unidade_compra numeric,
  quantidade_convertida numeric,
  numero_compras int,
  gasto numeric,
  preco_medio_unidade_medida numeric,
  ultimo_preco_unidade_medida numeric,
  ultima_compra date,
  preco_anterior_unidade_medida numeric,
  variacao_pct numeric,
  fornecedor_principal text
)
language sql
stable
security invoker
set search_path = public
as $$
  with periodo as (
    select * from public.financeiro_compras_itens_v v
    where v.data_lancamento between p_inicio and p_fim
      and (p_parte is null or v.parte_id = p_parte)
      and (p_busca is null or p_busca = '' or v.materia_prima_nome ilike '%' || p_busca || '%')
  ),
  agregado as (
    select
      pe.materia_prima_id,
      min(pe.materia_prima_nome) as nome,
      min(pe.unidade_medida) as unidade_medida,
      min(pe.unidade_compra) as unidade_compra,
      min(pe.fator_unidade_compra) as fator_unidade_compra,
      sum(pe.quantidade_convertida) as quantidade_convertida,
      count(*)::int as numero_compras,
      sum(pe.valor_total) as gasto
    from periodo pe
    group by pe.materia_prima_id
  ),
  recentes as (
    select
      v.materia_prima_id,
      v.data_lancamento,
      v.preco_por_unidade_medida,
      row_number() over (partition by v.materia_prima_id order by v.data_lancamento desc, v.id desc) as rn
    from public.financeiro_compras_itens_v v
    where v.data_lancamento <= p_fim
      and (p_parte is null or v.parte_id = p_parte)
      and v.materia_prima_id in (select a.materia_prima_id from agregado a)
  ),
  principal as (
    select distinct on (g.materia_prima_id) g.materia_prima_id, g.fornecedor_nome
    from (
      select pe.materia_prima_id, pe.fornecedor_nome, sum(pe.valor_total) as g
      from periodo pe
      group by pe.materia_prima_id, pe.fornecedor_nome
    ) g
    order by g.materia_prima_id, g.g desc
  )
  select
    a.materia_prima_id,
    a.nome,
    a.unidade_medida,
    a.unidade_compra,
    a.fator_unidade_compra,
    a.quantidade_convertida,
    a.numero_compras,
    a.gasto,
    a.gasto / nullif(a.quantidade_convertida, 0) as preco_medio_unidade_medida,
    r1.preco_por_unidade_medida as ultimo_preco_unidade_medida,
    r1.data_lancamento as ultima_compra,
    r2.preco_por_unidade_medida as preco_anterior_unidade_medida,
    case
      when r1.preco_por_unidade_medida is not null and r2.preco_por_unidade_medida is not null and r2.preco_por_unidade_medida > 0
        then (r1.preco_por_unidade_medida - r2.preco_por_unidade_medida) / r2.preco_por_unidade_medida * 100
    end as variacao_pct,
    pr.fornecedor_nome as fornecedor_principal
  from agregado a
  left join recentes r1 on r1.materia_prima_id = a.materia_prima_id and r1.rn = 1
  left join recentes r2 on r2.materia_prima_id = a.materia_prima_id and r2.rn = 2
  left join principal pr on pr.materia_prima_id = a.materia_prima_id
  order by a.gasto desc;
$$;
revoke all on function public.financeiro_compras_por_insumo(date, date, uuid, text) from public, anon;
grant execute on function public.financeiro_compras_por_insumo(date, date, uuid, text) to authenticated;

-- 3) despesas em conta de insumo, sem item cadastrado ---------------------------------------
create or replace function public.financeiro_compras_sem_item(p_inicio date, p_fim date)
returns table (quantidade int, valor numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int, coalesce(sum(l.valor_total), 0)
  from public.financeiro_lancamentos l
  join public.financeiro_contas c on c.id = l.conta_id
  where l.tipo = 'despesa'
    and l.status <> 'cancelado'
    and l.data_lancamento between p_inicio and p_fim
    and c.aplicavel_a = 'compras_insumos'
    and not exists (select 1 from public.financeiro_lancamento_itens i where i.lancamento_id = l.id);
$$;
revoke all on function public.financeiro_compras_sem_item(date, date) from public, anon;
grant execute on function public.financeiro_compras_sem_item(date, date) to authenticated;

-- 4) custo atual por insumo (último mês com compra) -----------------------------------------
create or replace view public.financeiro_custo_atual_mp with (security_invoker = true) as
select distinct on (m.materia_prima_id)
  m.materia_prima_id,
  m.mes_referencia,
  m.custo_medio_por_unidade_medida
from public.financeiro_custo_medio_mensal m
order by m.materia_prima_id, m.mes_referencia desc;

revoke all on public.financeiro_compras_itens_v, public.financeiro_custo_atual_mp from anon;
grant select on public.financeiro_compras_itens_v, public.financeiro_custo_atual_mp to authenticated;

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
select count(*) as itens_de_compra from public.financeiro_compras_itens_v;
select count(*) as insumos_com_custo_atual from public.financeiro_custo_atual_mp;
select nome, numero_compras, round(gasto, 2) as gasto, round(variacao_pct, 1) as variacao_pct, fornecedor_principal
from public.financeiro_compras_por_insumo(current_date - 90, current_date)
limit 5;
select * from public.financeiro_compras_sem_item(current_date - 90, current_date);

-- ROLLBACK ------------------------------------------------------------------------------------
-- begin;
-- drop function if exists public.financeiro_compras_sem_item(date, date);
-- drop function if exists public.financeiro_compras_por_insumo(date, date, uuid, text);
-- drop view if exists public.financeiro_custo_atual_mp;
-- drop view if exists public.financeiro_compras_itens_v;
-- drop index if exists public.financeiro_lancamentos_tipo_data_idx;
-- commit;
