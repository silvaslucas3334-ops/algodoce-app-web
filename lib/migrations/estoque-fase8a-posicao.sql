-- Fase 8a — Posição de Estoque (visão desktop do admin) (09/11/2026)
--
-- O QUE FAZ
--   View estoque_posicao: uma linha por PRODUTO × UNIDADE × SITUAÇÃO, só com etiquetas que estão
--   no estoque ou a caminho:
--     unidade    'cozinha' | 'loja1' | 'loja2'
--                (cozinha = etiqueta com status na_cozinha; loja = destino da etiqueta
--                 na_loja; a caminho = destino para onde a etiqueta está indo)
--     situacao   'disponivel'  (na_cozinha / na_loja)
--                'a_caminho'   (enviado: já saiu e ainda não recebeu entrada)
--     etiquetas  quantas etiquetas (cada etiqueta = 1 unidade)
--     quantidade soma de quantidade (ou peso em gramas, quando a etiqueta não tem quantidade)
--     proxima_validade, vencidas, vence_7d  (dia de hoje no fuso de São Paulo)
--   Agrega no servidor: a tela não esbarra no teto de 1000 linhas do PostgREST conforme o
--   estoque cresce.
--
-- SEGURANÇA
--   * Só leitura. security_invoker = respeita a RLS de quem consulta (acesso só de usuário
--     logado e ativo, como lotes_producao). Revogado de anon.
--   * Não altera nenhuma tabela nem dado existente.
--
-- ORDEM: rode ANTES de publicar o front da 8a. Seguro rodar mais de uma vez.

begin;

create or replace view public.estoque_posicao with (security_invoker = true) as
select
  p.id as produto_id,
  p.nome as produto_nome,
  p.categoria_id,
  coalesce(c.nome, 'Sem categoria') as categoria_nome,
  p.unidade_medida,
  case when l.status = 'na_cozinha' then 'cozinha' else l.destino end as unidade,
  case when l.status = 'enviado' then 'a_caminho' else 'disponivel' end as situacao,
  count(*)::int as etiquetas,
  sum(coalesce(nullif(l.quantidade, 0), l.peso_gramas, 0)) as quantidade,
  min(l.data_validade) as proxima_validade,
  (count(*) filter (where l.data_validade < hoje.d))::int as vencidas,
  (count(*) filter (where l.data_validade >= hoje.d and l.data_validade <= hoje.d + 7))::int as vence_7d
from public.lotes_producao l
join public.produtos p on p.id = l.produto_id
left join public.categorias c on c.id = p.categoria_id
cross join (select (now() at time zone 'America/Sao_Paulo')::date as d) hoje
where l.status in ('na_cozinha', 'na_loja', 'enviado')
group by p.id, p.nome, p.categoria_id, c.nome, p.unidade_medida, 6, 7;

revoke all on public.estoque_posicao from anon;
grant select on public.estoque_posicao to authenticated;

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
-- Totais por unidade e situação: devem bater com a contagem direta de lotes_producao
-- (hoje: disponivel = cozinha 14, loja1 36, loja2 79; a_caminho = 0).
select unidade, situacao, sum(etiquetas) as etiquetas, count(*) as linhas
from public.estoque_posicao
group by unidade, situacao
order by situacao, unidade;

-- Contagem direta para comparar:
select case when status = 'na_cozinha' then 'cozinha' else destino end as unidade,
       case when status = 'enviado' then 'a_caminho' else 'disponivel' end as situacao,
       count(*) as etiquetas
from public.lotes_producao
where status in ('na_cozinha', 'na_loja', 'enviado')
group by 1, 2
order by 2, 1;

-- ROLLBACK ------------------------------------------------------------------------------------
-- drop view if exists public.estoque_posicao;
