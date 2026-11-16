-- DRE · Fase 3 (parte decidida) — Pró-labore em conta própria + "Taxa de entrega" no nome certo (12/11/2026)
--
-- DECISÕES DO USUÁRIO
--   1. Pró-labore ganha conta própria (3007), dentro das DESPESAS OPERACIONAIS (antes do resultado).
--      A conta 3004 (Distribuição de Lucro) fica só para distribuição de verdade, no fim do DRE.
--   2. "Aluguel Lucas" (sócio) é pró-labore: vai para a 3007 junto com a recorrência dele.
--   3. A conta 2001 continua como DEDUÇÃO DE VENDA (a taxa de entrega entra no faturamento do PDV e é
--      reembolsada pelo cliente), mas o nome "DESCONTO DE VENDA" estava errado: vira "TAXA DE ENTREGA".
--
-- O QUE MUDA NO DRE
--   * O Resultado final de cada mês NÃO muda (o mesmo valor continua saindo, só muda de linha).
--   * "Lucro líquido antes da distribuição" cai pelo valor do pró-labore do mês; "Distribuição de Lucros" zera.
--   * Pró-labore lançado por engano na 2001 (deduções) sai das deduções (a receita líquida sobe) e vai
--     para a 3007 (a despesa operacional sobe no mesmo valor).
--
-- SEGURANÇA
--   * Tudo na PARTE 1 roda numa transação só e tem uma trava no fim: se o total mensal de despesas
--     (das contas que entram no DRE) mudar, ou sobrar pró-labore na 3004/2001, o banco desfaz tudo.
--   * Backups em tabelas _bkp_dre_v2a_* (com RLS ligado e sem policy: o app não enxerga).
--   * Cada lançamento movido gera uma linha no histórico (Fase 6a) como "Sistema": conta de → para.
--   * Não mexe em valor, data, status, competência, conciliação ou extrato. Seguro rodar mais de uma vez.
--
-- COMO RODAR (no SQL Editor do Supabase, uma parte por vez, colando só o bloco da parte):
--   PARTE 0 (diagnóstico, só leitura)  →  confira  →  PARTE 1 (migração)  →  PARTE 2 (conferência)
--   PARTE 3 só se precisar voltar atrás.
-- O front não depende desta migração para funcionar (o DRE lê a classificação da conta).

-- =====================================================================================================
-- PARTE 0 — DIAGNÓSTICO (somente leitura). Esperado: nenhum lançamento da 3004 fora do padrão (pró-labore e
-- aluguel de sócio); 0 itens de orçamento e 0 itens de nota na 3004; conta 3007 ainda inexistente.
-- =====================================================================================================
select 'lançamentos na 3004 (todos os status)' as item,
       count(*)::numeric as qtd, coalesce(sum(valor_total), 0) as valor
  from financeiro_lancamentos where conta_id = (select id from financeiro_contas where codigo = '3004')
union all
select 'lançamentos na 3004 que NÃO são pró-labore/aluguel Lucas (esperado 0)',
       count(*), coalesce(sum(valor_total), 0)
  from financeiro_lancamentos
 where conta_id = (select id from financeiro_contas where codigo = '3004')
   and not (descricao ilike '%labore%' or descricao ilike '%aluguel lucas%')
union all
select 'lançamentos na 2001 que são pró-labore (serão movidos para a 3007)',
       count(*), coalesce(sum(valor_total), 0)
  from financeiro_lancamentos
 where conta_id = (select id from financeiro_contas where codigo = '2001') and descricao ilike '%labore%'
union all
select 'recorrências na 3004', count(*), coalesce(sum(valor), 0)
  from financeiro_recorrencias where conta_id = (select id from financeiro_contas where codigo = '3004')
union all
select 'itens de orçamento na 3004 (esperado 0)', count(*), coalesce(sum(valor_previsto), 0)
  from financeiro_orcamento_itens where conta_id = (select id from financeiro_contas where codigo = '3004')
union all
select 'itens de nota (lancamento_itens) na 3004 (esperado 0)', count(*), 0
  from financeiro_lancamento_itens where conta_id = (select id from financeiro_contas where codigo = '3004')
union all
select 'conta 3007 já existe? (0 = não)', count(*), 0 from financeiro_contas where codigo = '3007'
union all
select 'tabelas _bkp_* SEM RLS no schema public (esperado 0)', count(*), 0
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like '\_bkp\_%' and not c.relrowsecurity;

-- pró-labore por mês (o que vai mudar de linha no DRE) — rode à parte se quiser conferir
-- select to_char(l.data_competencia, 'YYYY-MM') as mes, c.codigo as conta_atual, count(*) as qtd, sum(l.valor_total) as valor
--   from financeiro_lancamentos l join financeiro_contas c on c.id = l.conta_id
--  where l.status <> 'cancelado'
--    and ((c.codigo = '3004') or (c.codigo = '2001' and l.descricao ilike '%labore%'))
--  group by 1, 2 order by 1, 2;

-- =====================================================================================================
-- PARTE 1 — MIGRAÇÃO (uma transação; a trava no fim desfaz tudo se algo não bater)
-- =====================================================================================================
begin;

-- 1.1 Backups (só criam se ainda não existirem — rodar de novo não sobrescreve o original) ----------
create table if not exists _bkp_dre_v2a_contas as
  select * from financeiro_contas where codigo in ('2001', '3004');

create table if not exists _bkp_dre_v2a_lancamentos as
  select l.id, l.conta_id as conta_id_antes
    from financeiro_lancamentos l
   where (l.conta_id = (select id from financeiro_contas where codigo = '3004')
          and (l.descricao ilike '%labore%' or l.descricao ilike '%aluguel lucas%'))
      or (l.conta_id = (select id from financeiro_contas where codigo = '2001') and l.descricao ilike '%labore%');

create table if not exists _bkp_dre_v2a_recorrencias as
  select r.id, r.conta_id as conta_id_antes
    from financeiro_recorrencias r
   where r.conta_id = (select id from financeiro_contas where codigo = '3004')
     and (r.descricao ilike '%labore%' or r.descricao ilike '%aluguel lucas%');

-- total mensal de despesas das contas que entram no DRE, ANTES (base da trava no fim). Tabela temporária:
-- some no commit e é sempre recalculada, então rodar de novo depois de novos lançamentos não dá falso alarme.
create temp table _dre_v2a_totais_antes on commit drop as
  select date_trunc('month', l.data_competencia)::date as mes, round(sum(l.valor_total), 2) as total
    from financeiro_lancamentos l join financeiro_contas c on c.id = l.conta_id
   where l.status <> 'cancelado' and c.afeta_dre
   group by 1;

alter table _bkp_dre_v2a_contas        enable row level security;
alter table _bkp_dre_v2a_lancamentos   enable row level security;
alter table _bkp_dre_v2a_recorrencias  enable row level security;

-- 1.2 Conta nova: 3007 PRÓ-LABORE (centro de custo FINANCEIRO, junto da 3004 e da 3006) ---------------
-- linha_dre = despesas_operacionais → entra ANTES do resultado operacional; 3004 segue no fim do DRE.
insert into financeiro_contas
  (codigo, nome, centro_custo_id, grupo_dre, aplicavel_a, afeta_dre, linha_dre, afeta_fluxo_caixa, ativo)
select '3007', 'PRÓ-LABORE', c.centro_custo_id, 'Pró-labore', 'despesas_gerais',
       true, 'despesas_operacionais', true, true
  from financeiro_contas c
 where c.codigo = '3006'
on conflict (codigo) do nothing;

-- 1.3 Move os lançamentos (qualquer status, para o histórico ficar todo na conta certa) ---------------
update financeiro_lancamentos
   set conta_id = (select id from financeiro_contas where codigo = '3007')
 where id in (select id from _bkp_dre_v2a_lancamentos)
   and conta_id <> (select id from financeiro_contas where codigo = '3007');

-- 1.4 Move a recorrência do "Aluguel Lucas" (as próximas ocorrências nascem já na 3007) --------------
update financeiro_recorrencias
   set conta_id = (select id from financeiro_contas where codigo = '3007')
 where id in (select id from _bkp_dre_v2a_recorrencias)
   and conta_id <> (select id from financeiro_contas where codigo = '3007');

-- 1.5 Renomeia a 2001 (continua em Deduções de Venda) ------------------------------------------------
update financeiro_contas set nome = 'TAXA DE ENTREGA' where codigo = '2001' and nome <> 'TAXA DE ENTREGA';

-- 1.6 TRAVA: se qualquer verificação falhar, a exceção desfaz a transação inteira ----------------------
do $$
declare
  v_dif int;
  v_sobra bigint;
  v_rec bigint;
  v_id3004 uuid := (select id from financeiro_contas where codigo = '3004');
  v_id2001 uuid := (select id from financeiro_contas where codigo = '2001');
  v_id3007 uuid := (select id from financeiro_contas where codigo = '3007');
begin
  if v_id3007 is null then
    raise exception 'Conta 3007 não foi criada (centro de custo da 3006 ausente?). Nada foi alterado.';
  end if;

  -- (a) o total mensal de despesas das contas do DRE tem que ser IDÊNTICO ao de antes
  select count(*) into v_dif from (
    (select mes, total from _dre_v2a_totais_antes
     except
     select date_trunc('month', l.data_competencia)::date, round(sum(l.valor_total), 2)
       from financeiro_lancamentos l join financeiro_contas c on c.id = l.conta_id
      where l.status <> 'cancelado' and c.afeta_dre group by 1)
    union all
    (select date_trunc('month', l.data_competencia)::date, round(sum(l.valor_total), 2)
       from financeiro_lancamentos l join financeiro_contas c on c.id = l.conta_id
      where l.status <> 'cancelado' and c.afeta_dre group by 1
     except
     select mes, total from _dre_v2a_totais_antes)
  ) x;
  if v_dif > 0 then
    raise exception 'O total mensal de despesas mudou em % mês(es): migração desfeita.', v_dif;
  end if;

  -- (b) não pode sobrar pró-labore/aluguel de sócio na 3004, nem pró-labore na 2001
  select count(*) into v_sobra from financeiro_lancamentos
   where (conta_id = v_id3004 and (descricao ilike '%labore%' or descricao ilike '%aluguel lucas%'))
      or (conta_id = v_id2001 and descricao ilike '%labore%');
  if v_sobra > 0 then
    raise exception 'Sobraram % lançamento(s) de pró-labore nas contas antigas: migração desfeita.', v_sobra;
  end if;

  -- (c) a recorrência do aluguel de sócio tem que estar na 3007
  select count(*) into v_rec from financeiro_recorrencias
   where conta_id = v_id3004 and (descricao ilike '%labore%' or descricao ilike '%aluguel lucas%');
  if v_rec > 0 then
    raise exception 'Sobrou % recorrência(s) de pró-labore na 3004: migração desfeita.', v_rec;
  end if;
end $$;

commit;

-- =====================================================================================================
-- PARTE 2 — CONFERÊNCIA (somente leitura). Esperado:
--   3004 restantes = 0 · 3007 = tudo o que a Parte 0 mostrou na 3004 + o pró-labore da 2001
--   2001 sem pró-labore = 0 · nome da 2001 = TAXA DE ENTREGA · recorrência do aluguel = 3007
-- =====================================================================================================
select 'lançamentos restantes na 3004 (todos)' as item, count(*)::numeric as qtd, coalesce(sum(valor_total), 0) as valor
  from financeiro_lancamentos where conta_id = (select id from financeiro_contas where codigo = '3004')
union all
select 'lançamentos na 3007 (todos)', count(*), coalesce(sum(valor_total), 0)
  from financeiro_lancamentos where conta_id = (select id from financeiro_contas where codigo = '3007')
union all
select 'lançamentos na 3007 (sem cancelados)', count(*), coalesce(sum(valor_total), 0)
  from financeiro_lancamentos
 where conta_id = (select id from financeiro_contas where codigo = '3007') and status <> 'cancelado'
union all
select 'pró-labore ainda na 2001 (esperado 0)', count(*), coalesce(sum(valor_total), 0)
  from financeiro_lancamentos
 where conta_id = (select id from financeiro_contas where codigo = '2001') and descricao ilike '%labore%'
union all
select 'recorrências na 3007', count(*), coalesce(sum(valor), 0)
  from financeiro_recorrencias where conta_id = (select id from financeiro_contas where codigo = '3007')
union all
select 'nome da 2001 = TAXA DE ENTREGA? (1 = sim)', count(*), 0
  from financeiro_contas where codigo = '2001' and nome = 'TAXA DE ENTREGA'
union all
select 'conta 3007: linha_dre = despesas_operacionais e afeta_dre? (1 = sim)', count(*), 0
  from financeiro_contas where codigo = '3007' and linha_dre = 'despesas_operacionais' and afeta_dre;

-- pró-labore por mês depois da migração (comparar com o "antes" da Parte 0):
-- select to_char(l.data_competencia, 'YYYY-MM') as mes, count(*) as qtd, sum(l.valor_total) as valor
--   from financeiro_lancamentos l join financeiro_contas c on c.id = l.conta_id
--  where c.codigo = '3007' and l.status <> 'cancelado' group by 1 order by 1;

-- =====================================================================================================
-- PARTE 3 — ROLLBACK (só se for preciso voltar ao estado anterior)
--   Devolve cada lançamento/recorrência à conta de antes, restaura o nome da 2001 e remove a 3007 se
--   ficar vazia. As tabelas _bkp_dre_v2a_* ficam; apague-as quando tiver certeza (drop table ...).
-- =====================================================================================================
-- begin;
-- update financeiro_lancamentos l set conta_id = b.conta_id_antes
--   from _bkp_dre_v2a_lancamentos b where l.id = b.id;
-- update financeiro_recorrencias r set conta_id = b.conta_id_antes
--   from _bkp_dre_v2a_recorrencias b where r.id = b.id;
-- update financeiro_contas set nome = 'DESCONTO DE VENDA' where codigo = '2001';
-- delete from financeiro_contas
--  where codigo = '3007'
--    and not exists (select 1 from financeiro_lancamentos where conta_id = financeiro_contas.id)
--    and not exists (select 1 from financeiro_recorrencias where conta_id = financeiro_contas.id)
--    and not exists (select 1 from financeiro_orcamento_itens where conta_id = financeiro_contas.id);
-- commit;
