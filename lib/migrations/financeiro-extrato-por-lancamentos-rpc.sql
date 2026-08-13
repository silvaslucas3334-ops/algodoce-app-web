-- Pagamentos parciais (uma despesa/nota paga aos poucos, em mais de um
-- débito bancário) somem das Saídas do Fluxo de Caixa: a query de
-- "realizado" só olha financeiro_lancamentos.status='pago', então um
-- lançamento parcialmente pago (status continua 'aberto' até quitar,
-- corretamente) nunca aparece — Saídas/Saldo Acumulado ficam otimistas
-- demais.
--
-- O dinheiro que já saiu, com a data exata, já está gravado em
-- financeiro_extrato_transacoes (data, valor, lancamento_id) — mesmo em
-- pagamento parcial, confirmarConciliacaoParcial já vincula cada
-- transação ao lançamento. Só falta consultar isso.
--
-- Não dá pra ler financeiro_extrato_transacoes direto do Fluxo de Caixa
-- (chamado por loja/cozinha, não só admin) porque a RLS dessa tabela é
-- admin-only de propósito ("extrato: só admin (conciliação bancária)").
-- Esta function expõe só (lancamento_id, data, valor) já conciliados —
-- nunca descrição/CNPJ/conta bancária crua — pros lançamentos que quem
-- chama já filtrou (por unidade) numa query própria em
-- financeiro_lancamentos.
--
-- Idempotente — seguro rodar mesmo que já exista em produção.
-- Execute no Supabase SQL Editor.

CREATE OR REPLACE FUNCTION financeiro_extrato_por_lancamentos(p_lancamento_ids UUID[])
RETURNS TABLE (lancamento_id UUID, data DATE, valor NUMERIC) AS $$
  SELECT lancamento_id, data, ABS(valor) AS valor
  FROM financeiro_extrato_transacoes
  WHERE status_conciliacao = 'conciliado'
    AND lancamento_id = ANY(p_lancamento_ids);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION financeiro_extrato_por_lancamentos(UUID[]) TO authenticated;

-- Verificação
SELECT proname FROM pg_proc WHERE proname = 'financeiro_extrato_por_lancamentos';
