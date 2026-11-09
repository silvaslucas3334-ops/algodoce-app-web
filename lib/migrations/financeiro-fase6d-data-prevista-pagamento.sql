-- Fase 6d — data prevista de pagamento (09/11/2026)
--
-- O QUE FAZ
--   Coluna opcional em financeiro_lancamentos: quando o admin PLANEJA pagar (≠ vencimento).
--   O Fluxo de Caixa projeta a saída de uma conta EM ABERTO nesse dia (lib/financeiro-utils.ts,
--   dataNoFluxo): usa a data prevista se ela ainda não passou; senão volta ao vencimento.
--   Conta atrasada com data prevista de hoje em diante sai da lista "Atrasados" do Fluxo (já está
--   no calendário). DRE e conciliação automática do extrato NÃO usam esta coluna.
--
-- SEGURANÇA
--   * Só acrescenta uma coluna nula: nenhuma linha existente muda, nenhuma tela antiga quebra.
--   * Mudanças nela entram sozinhas no Histórico (gatilho da fase 6a compara a linha inteira).
--
-- STATUS: JÁ APLICADO no banco em 09/11/2026 (rodado pelo SQL Editor). Este arquivo só registra a
-- migration no repositório; seguro rodar de novo.

alter table public.financeiro_lancamentos
  add column if not exists data_prevista_pagamento date;

-- VERIFICAÇÃO ---------------------------------------------------------------------------------
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'financeiro_lancamentos' and column_name = 'data_prevista_pagamento';

-- ROLLBACK ------------------------------------------------------------------------------------
-- (só se nenhuma despesa tiver data prevista que você queira manter)
-- alter table public.financeiro_lancamentos drop column if exists data_prevista_pagamento;
