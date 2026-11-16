-- DRE — contas CENTRAIS, sempre rateadas entre as lojas (17/11/2026)
--
-- O QUE FAZ
--   Cria a marcação financeiro_contas.rateio_sempre (padrão false). No DRE de cada loja, o total do mês das contas
--   marcadas é dividido pela proporção do faturamento de cada loja, qualquer que seja a unidade em que o lançamento
--   foi feito (hoje só o que está em "Rateio (Cozinha)" é dividido). Você passa a marcar/desmarcar contas na tela
--   Plano de Contas — este SQL só deixa marcada a lista abaixo, decidida em 17/11.
--
-- CONTAS MARCADAS AGORA
--   1001 MATÉRIA-PRIMA · 1002 EMBALAGEM · 1004 IMPOSTOS DE COMPRA   (CMV — decidido antes)
--   3007 PRÓ-LABORE · 3006 SERVIÇOS CONTÁBEIS · 3004 DISTRIBUIÇÃO LUCRO
--   FICAM DE FORA, seguindo a unidade escolhida em cada lançamento (decisão do dono em 17/11):
--   3001 EMPRÉSTIMOS e 3003 AMORTIZAÇÕES (cada empréstimo é direcionado na hora de criar a despesa: o da loja de
--   Itajubá vai para Itajubá, o da empresa vai para "Rateio (Cozinha)"), 2005 (DAS) e 2006 (já estão 100% em Rateio;
--   marque na tela se quiser garantir daqui pra frente), mão de obra, despesas operacionais/diversas, marketing e as
--   taxas de venda (2001, 2003, 2004).
--
-- O QUE MUDA NO DRE
--   * Consolidado e fluxo de caixa NÃO mudam. Só a visão de cada loja (inclusive meses passados).
--   * Juros/multa (3005) acompanham a origem: nota de compra de insumos → rateio; despesa → vale a conta dela.
--
-- ORDEM: rode ANTES de publicar o front. (O front tem uma rede de segurança: sem a coluna, ele usa só 1001/1002/1004.)
-- Seguro rodar mais de uma vez. Só adiciona uma coluna e atualiza a marcação; não mexe em lançamentos.

-- =====================================================================================================
-- PARTE 0 — DIAGNÓSTICO (somente leitura): a coluna já existe? quais contas da lista existem?
-- =====================================================================================================
select 'coluna rateio_sempre já existe? (1 = sim)' as item,
       count(*)::int as qtd
  from information_schema.columns
 where table_schema = 'public' and table_name = 'financeiro_contas' and column_name = 'rateio_sempre'
union all
select 'contas da lista que existem no plano (esperado 6)', count(*)::int
  from financeiro_contas
 where codigo in ('1001', '1002', '1004', '3004', '3006', '3007');

-- =====================================================================================================
-- PARTE 1 — MIGRAÇÃO
-- =====================================================================================================
begin;

alter table financeiro_contas add column if not exists rateio_sempre boolean not null default false;

update financeiro_contas
   set rateio_sempre = true
 where codigo in ('1001', '1002', '1004', '3004', '3006', '3007')
   and rateio_sempre = false;

-- conferência dentro da transação: nenhuma conta fora da lista pode ter ficado marcada por este script
do $$
declare
  v_marcadas int;
begin
  select count(*) into v_marcadas
    from financeiro_contas
   where rateio_sempre and codigo not in ('1001', '1002', '1004', '3004', '3006', '3007');
  if v_marcadas > 0 then
    raise notice '% conta(s) fora da lista já estavam marcadas (marcação feita por você na tela): mantidas.', v_marcadas;
  end if;
end $$;

commit;

-- faz o PostgREST enxergar a coluna nova sem esperar
notify pgrst, 'reload schema';

-- =====================================================================================================
-- PARTE 2 — CONFERÊNCIA (somente leitura). Esperado: as 6 contas da lista marcadas (true); 3001/3003/2005/2006 false
-- =====================================================================================================
select codigo, nome, linha_dre, rateio_sempre
  from financeiro_contas
 where rateio_sempre or codigo in ('1001', '1002', '1004', '3001', '3003', '3004', '3006', '3007', '2005', '2006')
 order by codigo;

-- =====================================================================================================
-- PARTE 3 — ROLLBACK (só se precisar voltar atrás). Desmarca tudo; o DRE volta a ratear só o que está em
-- "Rateio (Cozinha)" (e, sem a coluna, o front usa a lista legada 1001/1002/1004).
-- =====================================================================================================
-- begin;
-- update financeiro_contas set rateio_sempre = false;
-- -- para remover a coluna de vez (opcional): alter table financeiro_contas drop column rateio_sempre;
-- commit;
-- notify pgrst, 'reload schema';
