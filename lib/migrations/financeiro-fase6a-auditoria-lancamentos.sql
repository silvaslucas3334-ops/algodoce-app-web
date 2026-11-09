-- Fase 6a — Auditoria dos lançamentos financeiros (09/11/2026)
--
-- O QUE FAZ
--   Registra, no banco, TODA mudança em financeiro_lancamentos (criado / alterado / pago /
--   cancelado / reaberto) e em financeiro_lancamento_itens (item adicionado / alterado /
--   removido): quem fez, quando e o que mudou (valor anterior → novo).
--   Por ser gatilho no banco, pega tudo: telas do app, conciliação de extrato, a rotina das
--   03:15 que gera as recorrências e SQLs rodados no SQL Editor (esses aparecem como "Sistema").
--
-- SEGURANÇA
--   * O gatilho NUNCA bloqueia a gravação: qualquer erro dentro dele é engolido (fica só um
--     WARNING no log do Postgres). Lançamento e item continuam sendo gravados normalmente.
--   * Só o admin lê o histórico (RLS). Ninguém grava nele pelo app: só os gatilhos
--     (SECURITY DEFINER). Não há policy de INSERT/UPDATE/DELETE para os clientes.
--   * Não mexe em nenhuma coluna de lançamentos/itens; não faz retroativo (o histórico
--     começa agora — lançamentos antigos mostram só "criado em" a partir do created_at).
--   * Colunas novas de financeiro_lancamentos (ex.: data prevista, 6d) entram sozinhas no
--     histórico: o gatilho compara a linha inteira, não uma lista fixa de campos.
--
-- ORDEM: rode ANTES de publicar o front da 6a. Seguro rodar mais de uma vez.

begin;

-- 1) tabela de histórico ------------------------------------------------------------------
create table if not exists public.financeiro_lancamentos_historico (
  id uuid primary key default gen_random_uuid(),
  -- cascade: se um lançamento for apagado por SQL (limpeza de teste), o histórico vai junto.
  lancamento_id uuid not null references public.financeiro_lancamentos (id) on delete cascade,
  em timestamptz not null default now(),
  usuario_id uuid, -- sem FK de propósito: nunca pode travar por causa de usuário removido
  usuario_nome text not null,
  acao text not null check (acao in (
    'criado', 'alterado', 'pago', 'cancelado', 'reaberto',
    'item_adicionado', 'item_alterado', 'item_removido'
  )),
  item_nome text, -- só nas ações de item: nome do insumo
  -- {"campo": {"de": ..., "para": ...}} nas alterações; {"campo": valor} em criado/item adicionado/removido
  mudancas jsonb not null default '{}'::jsonb
);
create index if not exists financeiro_lancamentos_historico_lanc_idx
  on public.financeiro_lancamentos_historico (lancamento_id, em desc);

alter table public.financeiro_lancamentos_historico enable row level security;
drop policy if exists "historico_lancamentos_select_admin" on public.financeiro_lancamentos_historico;
create policy "historico_lancamentos_select_admin" on public.financeiro_lancamentos_historico
  for select to authenticated
  using ((select public.usuario_eh_admin()));

revoke all on public.financeiro_lancamentos_historico from anon, authenticated;
grant select on public.financeiro_lancamentos_historico to authenticated;

-- 2) gatilho em financeiro_lancamentos --------------------------------------------------------
create or replace function public.financeiro_lancamentos_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_nome text;
  v_novo jsonb;
  v_velho jsonb;
  v_mud jsonb := '{}'::jsonb;
  v_chave text;
  v_acao text;
begin
  begin
    v_uid := auth.uid();
    if v_uid is not null then
      select u.nome into v_nome from public.usuarios u where u.id = v_uid;
    end if;
    v_nome := coalesce(v_nome, case when v_uid is null then 'Sistema' else 'Usuário' end);

    if tg_op = 'INSERT' then
      insert into public.financeiro_lancamentos_historico (lancamento_id, usuario_id, usuario_nome, acao, mudancas)
      values (
        new.id, v_uid, v_nome, 'criado',
        jsonb_build_object('valor_total', new.valor_total, 'data_vencimento', new.data_vencimento, 'status', new.status)
      );
      return null;
    end if;

    -- UPDATE: compara a linha inteira (menos carimbos de tempo) e guarda só o que mudou.
    v_novo := to_jsonb(new) - 'updated_at' - 'created_at';
    v_velho := to_jsonb(old) - 'updated_at' - 'created_at';
    for v_chave in select jsonb_object_keys(v_novo) loop
      if (v_novo -> v_chave) is distinct from (v_velho -> v_chave) then
        v_mud := v_mud || jsonb_build_object(
          v_chave, jsonb_build_object('de', v_velho -> v_chave, 'para', v_novo -> v_chave)
        );
      end if;
    end loop;

    if v_mud = '{}'::jsonb then
      return null; -- só updated_at mudou: nada a registrar
    end if;

    v_acao := case
      when old.status is distinct from new.status and new.status = 'pago' then 'pago'
      when old.status is distinct from new.status and new.status = 'cancelado' then 'cancelado'
      when old.status is distinct from new.status and new.status = 'aberto' then 'reaberto'
      else 'alterado'
    end;

    insert into public.financeiro_lancamentos_historico (lancamento_id, usuario_id, usuario_nome, acao, mudancas)
    values (new.id, v_uid, v_nome, v_acao, v_mud);
  exception when others then
    raise warning 'auditoria de lançamento falhou (ignorado): %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.financeiro_lancamentos_auditar() from public, anon, authenticated;

drop trigger if exists trg_financeiro_lancamentos_auditar on public.financeiro_lancamentos;
create trigger trg_financeiro_lancamentos_auditar
  after insert or update on public.financeiro_lancamentos
  for each row execute function public.financeiro_lancamentos_auditar();

-- 3) gatilho em financeiro_lancamento_itens ---------------------------------------------------
create or replace function public.financeiro_lancamento_itens_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_nome text;
  v_novo jsonb;
  v_velho jsonb;
  v_mud jsonb := '{}'::jsonb;
  v_chave text;
  v_mp_novo text;
  v_mp_velho text;
begin
  begin
    v_uid := auth.uid();
    if v_uid is not null then
      select u.nome into v_nome from public.usuarios u where u.id = v_uid;
    end if;
    v_nome := coalesce(v_nome, case when v_uid is null then 'Sistema' else 'Usuário' end);

    if tg_op = 'INSERT' then
      select mp.nome into v_mp_novo from public.financeiro_materias_primas mp where mp.id = new.materia_prima_id;
      insert into public.financeiro_lancamentos_historico (lancamento_id, usuario_id, usuario_nome, acao, item_nome, mudancas)
      values (
        new.lancamento_id, v_uid, v_nome, 'item_adicionado', v_mp_novo,
        jsonb_build_object(
          'quantidade', new.quantidade, 'unidade_nota', new.unidade_nota,
          'valor_unitario', new.valor_unitario, 'valor_total', new.valor_total
        )
      );
      return null;
    end if;

    if tg_op = 'DELETE' then
      select mp.nome into v_mp_velho from public.financeiro_materias_primas mp where mp.id = old.materia_prima_id;
      insert into public.financeiro_lancamentos_historico (lancamento_id, usuario_id, usuario_nome, acao, item_nome, mudancas)
      values (
        old.lancamento_id, v_uid, v_nome, 'item_removido', v_mp_velho,
        jsonb_build_object(
          'quantidade', old.quantidade, 'unidade_nota', old.unidade_nota,
          'valor_unitario', old.valor_unitario, 'valor_total', old.valor_total
        )
      );
      return null;
    end if;

    -- UPDATE
    v_novo := to_jsonb(new) - 'created_at' - 'id';
    v_velho := to_jsonb(old) - 'created_at' - 'id';
    for v_chave in select jsonb_object_keys(v_novo) loop
      if (v_novo -> v_chave) is distinct from (v_velho -> v_chave) then
        v_mud := v_mud || jsonb_build_object(
          v_chave, jsonb_build_object('de', v_velho -> v_chave, 'para', v_novo -> v_chave)
        );
      end if;
    end loop;

    if v_mud = '{}'::jsonb then
      return null;
    end if;

    select mp.nome into v_mp_novo from public.financeiro_materias_primas mp where mp.id = new.materia_prima_id;
    if (v_mud -> 'materia_prima_id') is not null then
      -- troca de insumo: mostra os NOMES (uuid não diz nada a ninguém)
      select mp.nome into v_mp_velho from public.financeiro_materias_primas mp where mp.id = old.materia_prima_id;
      v_mud := (v_mud - 'materia_prima_id') || jsonb_build_object(
        'materia_prima', jsonb_build_object('de', to_jsonb(v_mp_velho), 'para', to_jsonb(v_mp_novo))
      );
    end if;

    insert into public.financeiro_lancamentos_historico (lancamento_id, usuario_id, usuario_nome, acao, item_nome, mudancas)
    values (new.lancamento_id, v_uid, v_nome, 'item_alterado', v_mp_novo, v_mud);
  exception when others then
    raise warning 'auditoria de item falhou (ignorado): %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.financeiro_lancamento_itens_auditar() from public, anon, authenticated;

drop trigger if exists trg_financeiro_lancamento_itens_auditar on public.financeiro_lancamento_itens;
create trigger trg_financeiro_lancamento_itens_auditar
  after insert or update or delete on public.financeiro_lancamento_itens
  for each row execute function public.financeiro_lancamento_itens_auditar();

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
-- 2 gatilhos ativos (um em lançamentos, outro em itens):
select tgrelid::regclass as tabela, tgname as gatilho, tgenabled as ativo
from pg_trigger
where tgname in ('trg_financeiro_lancamentos_auditar', 'trg_financeiro_lancamento_itens_auditar')
  and not tgisinternal;

-- histórico começa vazio (nenhuma linha antes de hoje):
select count(*) as linhas_no_historico from public.financeiro_lancamentos_historico;

-- TESTE OPCIONAL (não deixa nada no banco): garante que a rotina das recorrências continua
-- rodando com o gatilho. Rode este bloco SOZINHO (selecione só ele). O ROLLBACK desfaz tudo.
-- Se a função devolver sem erro, está ok (pode gerar 0 linhas se hoje não houver recorrência a gerar).
-- begin;
-- select public.gerar_lancamentos_recorrentes();
-- select acao, usuario_nome, count(*) from public.financeiro_lancamentos_historico group by 1, 2;
-- rollback;

-- ROLLBACK ------------------------------------------------------------------------------------
-- begin;
-- drop trigger if exists trg_financeiro_lancamento_itens_auditar on public.financeiro_lancamento_itens;
-- drop trigger if exists trg_financeiro_lancamentos_auditar on public.financeiro_lancamentos;
-- drop function if exists public.financeiro_lancamento_itens_auditar();
-- drop function if exists public.financeiro_lancamentos_auditar();
-- drop table if exists public.financeiro_lancamentos_historico;
-- commit;
