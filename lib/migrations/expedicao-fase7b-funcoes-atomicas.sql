-- Fase 7b — Expedição: enviar e receber romaneio de forma ATÔMICA (09/11/2026)
--
-- POR QUE
--   Hoje as telas gravam em vários passos soltos (etiquetas, movimentações, romaneio) e
--   ignoram erros: uma falha no meio deixa o estoque inconsistente sem ninguém ver. E o
--   recebimento permite "parcial", deixando romaneio pendente. Estas funções fazem TUDO em
--   uma única transação: se qualquer parte falhar, NADA é gravado e a tela recebe a mensagem.
--
-- O QUE FAZ
--   1) enviar_romaneio(id): rascunho → enviado.
--        * confere que TODAS as etiquetas ainda estão no lugar certo (envio: na cozinha;
--          transferência: no estoque da loja de origem). Se alguma já foi vendida/movida, não
--          envia nada e diz quantas faltam;
--        * etiquetas viram 'enviado' com o destino do romaneio;
--        * envio da cozinha grava a movimentação 'transferencia' cozinha → destino (como antes);
--          transferência de loja não grava movimentação (como antes);
--        * romaneio vira 'confirmado' (confirmado_por/em preenchidos).
--   2) receber_romaneio(id): enviado → recebido, SEMPRE completo (sem parcial).
--        * etiquetas ainda 'enviado' viram na_loja (destino loja) ou na_cozinha (destino
--          cozinha); as já recebidas antes (ex.: pelo Scanner) ficam como estão;
--        * destino loja grava a movimentação 'entrada' com a ORIGEM REAL do romaneio (antes era
--          sempre "cozinha", errado em transferência entre lojas); devolução à cozinha não grava
--          movimentação (como antes);
--        * romaneio vira 'em_estoque' com recebido_em/recebido_por;
--        * já recebido = não faz nada e avisa (chamar duas vezes é seguro);
--        * só a unidade de destino (loja/cozinha) ou o admin pode receber.
--   3) Gatilho em lotes_producao: quando a ÚLTIMA etiqueta de um romaneio sai de 'enviado' (por
--      qualquer caminho, inclusive o Scanner bipando etiqueta a etiqueta), o romaneio fecha sozinho.
--      Acaba o "já recebido, falta concluir". Nunca bloqueia a gravação da etiqueta (erro vira aviso).
--
-- SEGURANÇA
--   * enviar/receber são SECURITY INVOKER: valem as mesmas permissões (RLS) de quem chama.
--   * Só usuários logados executam (revogado de anon). Só acrescenta funções e um gatilho; não
--     altera nenhuma tabela nem dado existente.
--
-- ORDEM: rode ANTES de publicar o front da 7b. Seguro rodar mais de uma vez.

begin;

-- 1) enviar_romaneio -----------------------------------------------------------------------------
create or replace function public.enviar_romaneio(p_romaneio_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.romaneios%rowtype;
  v_ids text[];
  v_origem text;
  v_nome text;
  v_enviadas int;
begin
  select * into r from public.romaneios where id = p_romaneio_id for update;
  if not found then
    raise exception 'Romaneio não encontrado.';
  end if;
  if r.status in ('confirmado', 'em_estoque') then
    raise exception 'Este romaneio já foi enviado.';
  end if;
  if r.status <> 'rascunho' then
    raise exception 'Este romaneio não pode ser enviado (situação: %).', r.status;
  end if;

  select coalesce(array_agg(distinct e), '{}'::text[])
    into v_ids
  from jsonb_array_elements(coalesce(r.linhas, '[]'::jsonb)) l,
       jsonb_array_elements_text(coalesce(l -> 'etiquetas_selecionadas', '[]'::jsonb)) e;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'O romaneio não tem etiquetas.';
  end if;

  v_origem := coalesce(r.unidade_origem, case when r.tipo = 'envio' then 'cozinha' end);
  select u.nome into v_nome from public.usuarios u where u.id = auth.uid();
  v_nome := coalesce(v_nome, 'Sistema');

  with movidas as (
    update public.lotes_producao lp
       set status = 'enviado', destino = r.unidade_destino
     where lp.id::text = any (v_ids)
       and (
         (r.tipo = 'envio' and lp.status = 'na_cozinha')
         or (r.tipo = 'transferencia' and lp.status = 'na_loja' and (v_origem is null or lp.destino = v_origem))
       )
    returning lp.id
  ), mov as (
    insert into public.movimentacoes_estoque (lote_id, tipo, local_origem, local_destino, quantidade, registrado_por)
    select m.id, 'transferencia', 'cozinha', r.unidade_destino, 1, v_nome
    from movidas m
    where r.tipo = 'envio'
    returning 1
  )
  select count(*) into v_enviadas from movidas;

  if v_enviadas <> cardinality(v_ids) then
    -- exceção desfaz tudo (etiquetas e movimentações desta chamada)
    raise exception '% de % etiqueta(s) deste romaneio não estão mais disponíveis % (já foram vendidas, enviadas ou movidas). Nada foi enviado: atualize a tela e refaça o romaneio.',
      cardinality(v_ids) - v_enviadas, cardinality(v_ids),
      case when r.tipo = 'envio' then 'na cozinha' else 'no estoque da loja de origem' end;
  end if;

  update public.romaneios
     set status = 'confirmado',
         confirmado_por = auth.uid(),
         confirmado_em = now(),
         atualizado_em = now()
   where id = r.id;

  return jsonb_build_object('etiquetas', v_enviadas);
end;
$$;

revoke all on function public.enviar_romaneio(uuid) from public, anon;
grant execute on function public.enviar_romaneio(uuid) to authenticated;

-- 2) receber_romaneio ----------------------------------------------------------------------------
create or replace function public.receber_romaneio(p_romaneio_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r public.romaneios%rowtype;
  v_ids text[];
  v_origem text;
  v_nome text;
  v_role text;
  v_loja text;
  v_novo_status text;
  v_recebidas int;
begin
  select * into r from public.romaneios where id = p_romaneio_id for update;
  if not found then
    raise exception 'Romaneio não encontrado.';
  end if;
  if r.status = 'em_estoque' then
    return jsonb_build_object('ja_recebido', true, 'recebidas', 0);
  end if;
  if r.status = 'rascunho' then
    raise exception 'Este romaneio ainda não foi enviado.';
  end if;
  if r.status <> 'confirmado' then
    raise exception 'Este romaneio não pode ser recebido (situação: %).', r.status;
  end if;

  select u.role, u.loja_id, u.nome into v_role, v_loja, v_nome from public.usuarios u where u.id = auth.uid();
  v_nome := coalesce(v_nome, 'Sistema');
  if auth.uid() is not null
     and not coalesce(
       v_role = 'admin'
       or (v_role = 'cozinha' and r.unidade_destino = 'cozinha')
       or (v_role = 'loja' and v_loja = r.unidade_destino),
       false
     ) then
    raise exception 'Só a unidade de destino (%) ou o administrador pode receber este romaneio.', r.unidade_destino;
  end if;

  select coalesce(array_agg(distinct e), '{}'::text[])
    into v_ids
  from jsonb_array_elements(coalesce(r.linhas, '[]'::jsonb)) l,
       jsonb_array_elements_text(coalesce(l -> 'etiquetas_selecionadas', '[]'::jsonb)) e;

  v_origem := coalesce(r.unidade_origem, case when r.tipo = 'envio' then 'cozinha' end);
  v_novo_status := case when r.unidade_destino = 'cozinha' then 'na_cozinha' else 'na_loja' end;

  with recebidas as (
    update public.lotes_producao lp
       set status = v_novo_status, destino = r.unidade_destino
     where lp.id::text = any (v_ids)
       and lp.status = 'enviado'
    returning lp.id
  ), mov as (
    insert into public.movimentacoes_estoque (lote_id, tipo, local_origem, local_destino, quantidade, registrado_por)
    select rc.id, 'entrada', v_origem, r.unidade_destino, 1, v_nome
    from recebidas rc
    where r.unidade_destino <> 'cozinha'
    returning 1
  )
  select count(*) into v_recebidas from recebidas;

  update public.romaneios
     set status = 'em_estoque',
         atualizado_em = now(),
         recebido_em = now(),
         recebido_por = auth.uid()
   where id = r.id;

  return jsonb_build_object(
    'ja_recebido', false,
    'recebidas', v_recebidas,
    'ja_recebidas_antes', cardinality(v_ids) - v_recebidas
  );
end;
$$;

revoke all on function public.receber_romaneio(uuid) from public, anon;
grant execute on function public.receber_romaneio(uuid) to authenticated;

-- 3) fecha o romaneio quando a última etiqueta chega (qualquer caminho, inclusive Scanner) ---------
create or replace function public.romaneios_fechar_quando_recebido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    update public.romaneios rm
       set status = 'em_estoque',
           atualizado_em = now(),
           recebido_em = coalesce(rm.recebido_em, now()),
           recebido_por = coalesce(rm.recebido_por, auth.uid())
     where rm.status = 'confirmado'
       and exists (
         select 1
         from jsonb_array_elements(coalesce(rm.linhas, '[]'::jsonb)) l,
              jsonb_array_elements_text(coalesce(l -> 'etiquetas_selecionadas', '[]'::jsonb)) e
         where e = new.id::text
       )
       and not exists (
         select 1
         from jsonb_array_elements(coalesce(rm.linhas, '[]'::jsonb)) l2,
              jsonb_array_elements_text(coalesce(l2 -> 'etiquetas_selecionadas', '[]'::jsonb)) e2
         join public.lotes_producao lp on lp.id::text = e2
         where lp.status = 'enviado'
       );
  exception when others then
    raise warning 'fechamento automático de romaneio falhou (ignorado): %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.romaneios_fechar_quando_recebido() from public, anon, authenticated;

drop trigger if exists trg_romaneios_fechar_quando_recebido on public.lotes_producao;
create trigger trg_romaneios_fechar_quando_recebido
  after update of status on public.lotes_producao
  for each row
  when (old.status = 'enviado' and new.status is distinct from 'enviado')
  execute function public.romaneios_fechar_quando_recebido();

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
select proname as funcao, prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('enviar_romaneio', 'receber_romaneio', 'romaneios_fechar_quando_recebido')
order by proname;

select tgname as gatilho, tgrelid::regclass as tabela, tgenabled as ativo
from pg_trigger
where tgname = 'trg_romaneios_fechar_quando_recebido' and not tgisinternal;

-- ROLLBACK ------------------------------------------------------------------------------------
-- begin;
-- drop trigger if exists trg_romaneios_fechar_quando_recebido on public.lotes_producao;
-- drop function if exists public.romaneios_fechar_quando_recebido();
-- drop function if exists public.receber_romaneio(uuid);
-- drop function if exists public.enviar_romaneio(uuid);
-- commit;
