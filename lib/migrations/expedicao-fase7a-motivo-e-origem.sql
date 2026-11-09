-- Fase 7a — Expedição: motivo da transferência + origem gravada (09/11/2026)
--
-- O QUE FAZ
--   Acrescenta em romaneios (todas as colunas são NULAS por padrão — nada existente muda):
--     * unidade_origem  de onde o romaneio sai: 'cozinha' | 'loja1' | 'loja2'.
--                       Antes a origem era deduzida de quem criou; transferência criada pelo
--                       admin ficava "origem não registrada".
--     * motivo          só para tipo = 'transferencia':
--                         'transferencia'      transferência simples (entre lojas)
--                         'devolucao_saldo'    devolução de saldo — não veio fisicamente (volta p/ cozinha)
--                         'devolucao_problema' devolução de produto com problema: avaria, vencido,
--                                              errado (volta p/ cozinha)
--                       Romaneios antigos ficam com motivo nulo (a tela mostra "Transferência").
--     * recebido_em / recebido_por   preenchidos pela fase 7b ao fechar o recebimento.
--   Backfill de unidade_origem: envio = cozinha; transferência = unidade de quem criou
--   (usuarios.role/loja_id). Criadas por admin continuam nulas (não há como saber).
--
-- SEGURANÇA
--   * Só colunas novas e UPDATE de unidade_origem onde ela ainda é nula.
--   * A visibilidade da origem entra como uma SEGUNDA política de SELECT (políticas permissivas
--     se somam): a loja de origem passa a enxergar o romaneio mesmo quando quem criou foi o
--     admin. A política atual (romaneios_select_por_loja) NÃO é alterada nem removida.
--
-- ORDEM: rode ANTES de publicar o front da 7a (a tela passa a gravar as colunas novas).
-- Seguro rodar mais de uma vez.

begin;

alter table public.romaneios
  add column if not exists unidade_origem text,
  add column if not exists motivo text,
  add column if not exists recebido_em timestamptz,
  add column if not exists recebido_por uuid;

-- valores válidos (aceita nulo)
alter table public.romaneios drop constraint if exists romaneios_unidade_origem_check;
alter table public.romaneios
  add constraint romaneios_unidade_origem_check
  check (unidade_origem is null or unidade_origem in ('cozinha', 'loja1', 'loja2'));

alter table public.romaneios drop constraint if exists romaneios_motivo_check;
alter table public.romaneios
  add constraint romaneios_motivo_check
  check (motivo is null or motivo in ('transferencia', 'devolucao_saldo', 'devolucao_problema'));

-- backfill da origem ---------------------------------------------------------------------------
update public.romaneios
set unidade_origem = 'cozinha'
where unidade_origem is null and tipo = 'envio';

update public.romaneios r
set unidade_origem = case
    when u.role = 'cozinha' then 'cozinha'
    when u.role = 'loja' and u.loja_id in ('loja1', 'loja2') then u.loja_id
    else null
  end
from public.usuarios u
where r.tipo = 'transferencia'
  and r.unidade_origem is null
  and u.id = r.criado_por;

-- a loja de origem enxerga o romaneio (soma com a política existente) ---------------------------
drop policy if exists romaneios_select_origem on public.romaneios;
create policy romaneios_select_origem on public.romaneios
  for select to authenticated
  using (
    unidade_origem is not null
    and unidade_origem = (select loja_id from public.usuarios where id = auth.uid())
  );

commit;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
-- Origem preenchida por tipo (as nulas são transferências criadas pelo admin):
select tipo,
       count(*) as total,
       count(*) filter (where unidade_origem is not null) as com_origem,
       count(*) filter (where unidade_origem is null) as sem_origem
from public.romaneios
group by tipo
order by tipo;

-- Colunas criadas:
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'romaneios'
  and column_name in ('unidade_origem', 'motivo', 'recebido_em', 'recebido_por')
order by column_name;

-- Políticas de SELECT: devem aparecer a antiga (romaneios_select_por_loja) e a nova (romaneios_select_origem):
select policyname, cmd from pg_policies where tablename = 'romaneios' and cmd = 'SELECT' order by policyname;

-- ROLLBACK ------------------------------------------------------------------------------------
-- begin;
-- drop policy if exists romaneios_select_origem on public.romaneios;
-- alter table public.romaneios drop constraint if exists romaneios_motivo_check;
-- alter table public.romaneios drop constraint if exists romaneios_unidade_origem_check;
-- alter table public.romaneios
--   drop column if exists recebido_por, drop column if exists recebido_em,
--   drop column if exists motivo, drop column if exists unidade_origem;
-- commit;
