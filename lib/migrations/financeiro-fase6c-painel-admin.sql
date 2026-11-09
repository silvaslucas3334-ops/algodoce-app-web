-- Fase 6c — painel "Contas a pagar" no Início do admin (09/11/2026)
--
-- O QUE FAZ
--   financeiro_painel_admin(): devolve, em UMA chamada, quatro totais das despesas/notas EM ABERTO
--   que afetam o caixa (afeta_fluxo_caixa = true), sempre pelo valor que ainda FALTA pagar
--   (valor_total − valor_pago_conciliado):
--     * atrasadas        vencimento antes de hoje
--     * hoje             vencimento hoje
--     * prox7            vencimento de amanhã até daqui a 7 dias
--     * aprovadas        etiqueta "Aprovada p/ pagamento" (qualquer vencimento, inclusive atrasadas)
--   "Hoje" é o dia no fuso de São Paulo (o servidor roda em UTC).
--
-- SEGURANÇA
--   * security invoker: respeita a RLS de quem chama (admin vê tudo; os outros só veriam o que
--     criaram — e a tela só chama para admin).
--   * Só leitura. Não altera nenhuma tabela.
--   * Não-caixa (afeta_fluxo_caixa = false) fica de fora, como no Fluxo de Caixa: não gera
--     conta a pagar. A lista de Despesas mostra essas com o selo "Não-caixa".
--
-- ORDEM: rode ANTES de publicar o front da 6c. Seguro rodar mais de uma vez.

begin;

create or replace function public.financeiro_painel_admin()
returns table (
  atrasadas_qtd int,
  atrasadas_valor numeric,
  hoje_qtd int,
  hoje_valor numeric,
  prox7_qtd int,
  prox7_valor numeric,
  aprovadas_qtd int,
  aprovadas_valor numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      l.data_vencimento,
      l.etiqueta_aprovacao,
      (l.valor_total - coalesce(l.valor_pago_conciliado, 0)) as restante,
      (now() at time zone 'America/Sao_Paulo')::date as hoje
    from public.financeiro_lancamentos l
    where l.status = 'aberto'
      and l.afeta_fluxo_caixa
  )
  select
    (count(*) filter (where data_vencimento < hoje))::int,
    coalesce(sum(restante) filter (where data_vencimento < hoje), 0),
    (count(*) filter (where data_vencimento = hoje))::int,
    coalesce(sum(restante) filter (where data_vencimento = hoje), 0),
    (count(*) filter (where data_vencimento > hoje and data_vencimento <= hoje + 7))::int,
    coalesce(sum(restante) filter (where data_vencimento > hoje and data_vencimento <= hoje + 7), 0),
    (count(*) filter (where etiqueta_aprovacao = 'aprovada_pagamento'))::int,
    coalesce(sum(restante) filter (where etiqueta_aprovacao = 'aprovada_pagamento'), 0)
  from base;
$$;

revoke all on function public.financeiro_painel_admin() from public, anon;
grant execute on function public.financeiro_painel_admin() to authenticated;

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
-- (no SQL Editor você é "postgres" e vê tudo, então o resultado deve bater com as contas abaixo)
select * from public.financeiro_painel_admin();

select
  count(*) filter (where l.afeta_fluxo_caixa and l.data_vencimento < h.hoje) as atrasadas_qtd,
  count(*) filter (where l.afeta_fluxo_caixa and l.data_vencimento = h.hoje) as hoje_qtd,
  count(*) filter (where l.afeta_fluxo_caixa and l.etiqueta_aprovacao = 'aprovada_pagamento') as aprovadas_qtd,
  count(*) filter (where not l.afeta_fluxo_caixa) as abertas_nao_caixa_fora_do_painel
from public.financeiro_lancamentos l
cross join (select (now() at time zone 'America/Sao_Paulo')::date as hoje) h
where l.status = 'aberto';

-- ROLLBACK ------------------------------------------------------------------------------------
-- drop function if exists public.financeiro_painel_admin();
