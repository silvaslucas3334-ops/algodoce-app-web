import { supabase } from './supabase'
import { CategoriaReceita } from './types'
import { CATEGORIA_RECEITA_LABEL } from './constants'

/**
 * Categoriza um crédito do extrato como receita: cria a linha em
 * financeiro_receitas (com o lastro do extrato) e marca a transação como
 * conciliada. Duas chamadas sequenciais, não atômicas — mesmo padrão já
 * aceito em confirmarConciliacao (lib/financeiro-reconciliacao.ts); se a
 * segunda falhar, o erro sobe e o usuário tenta de novo (idempotente, a
 * receita já criada não duplica graças ao índice único em extrato_transacao_id).
 */
export async function categorizarReceita(
  transacaoId: string,
  unidade: 'loja1' | 'loja2',
  categoria: Exclude<CategoriaReceita, 'dinheiro'>,
  valor: number,
  data: string,
  observacao: string | null,
  usuarioId: string
): Promise<void> {
  const { error: erroReceita } = await supabase.from('financeiro_receitas').insert({
    unidade,
    categoria,
    data,
    valor,
    observacao,
    extrato_transacao_id: transacaoId,
    criado_por: usuarioId,
  })
  if (erroReceita) throw new Error(erroReceita.message)

  const { error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'conciliado' })
    .eq('id', transacaoId)
  if (erroTransacao) throw new Error(erroTransacao.message)
}

/**
 * Lança uma receita em dinheiro — nunca tem transação de extrato associada,
 * já que venda em dinheiro não passa pelo banco.
 */
export async function criarReceitaManualDinheiro(
  unidade: 'loja1' | 'loja2',
  data: string,
  valor: number,
  observacao: string | null,
  usuarioId: string
): Promise<void> {
  const { error } = await supabase.from('financeiro_receitas').insert({
    unidade,
    categoria: 'dinheiro',
    data,
    valor,
    observacao,
    extrato_transacao_id: null,
    criado_por: usuarioId,
  })
  if (error) throw new Error(error.message)
}

export interface FluxoCaixaMensal {
  unidade: 'loja1' | 'loja2'
  entradasPorCategoria: { categoria: CategoriaReceita; label: string; valor: number }[]
  totalEntradas: number
  saidasPorGrupoDre: { grupoDre: string; valor: number }[]
  totalSaidas: number
  saldo: number
}

/**
 * Fluxo de caixa do mês: entradas (financeiro_receitas) x saídas
 * (financeiro_lancamentos pagas, por data_pagamento — é caixa, não
 * competência). unidade exata (loja1/loja2) exclui despesas 'rateio' de
 * propósito — essa fase não aplica a regra de rateio por faturamento
 * (fica pra fase DRE); a tela precisa avisar isso ao usuário.
 */
export async function buscarFluxoCaixaMensal(
  unidade: 'loja1' | 'loja2',
  ano: number,
  mes: number
): Promise<FluxoCaixaMensal> {
  const pad = (n: number) => String(n).padStart(2, '0')
  const dataMin = `${ano}-${pad(mes)}-01`
  const dataMax = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`

  const [{ data: receitas, error: erroReceitas }, { data: despesas, error: erroDespesas }] = await Promise.all([
    supabase
      .from('financeiro_receitas')
      .select('categoria, valor')
      .eq('unidade', unidade)
      .gte('data', dataMin)
      .lte('data', dataMax),
    supabase
      .from('financeiro_lancamentos')
      .select('valor_total, conta:financeiro_contas(grupo_dre)')
      .eq('unidade', unidade)
      .eq('status', 'pago')
      .gte('data_pagamento', dataMin)
      .lte('data_pagamento', dataMax),
  ])
  if (erroReceitas) throw new Error(erroReceitas.message)
  if (erroDespesas) throw new Error(erroDespesas.message)

  // Zero-fill das categorias conhecidas, na ordem do label.
  const somaPorCategoria = new Map<CategoriaReceita, number>()
  Object.keys(CATEGORIA_RECEITA_LABEL).forEach((c) => somaPorCategoria.set(c as CategoriaReceita, 0))
  ;(receitas || []).forEach((r: any) => {
    somaPorCategoria.set(r.categoria, (somaPorCategoria.get(r.categoria) || 0) + r.valor)
  })
  const entradasPorCategoria = Array.from(somaPorCategoria.entries()).map(([categoria, valor]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    valor,
  }))
  const totalEntradas = entradasPorCategoria.reduce((s, c) => s + c.valor, 0)

  const somaPorGrupoDre = new Map<string, number>()
  ;(despesas || []).forEach((d: any) => {
    const grupo = d.conta?.grupo_dre || 'Sem classificação'
    somaPorGrupoDre.set(grupo, (somaPorGrupoDre.get(grupo) || 0) + d.valor_total)
  })
  const saidasPorGrupoDre = Array.from(somaPorGrupoDre.entries())
    .map(([grupoDre, valor]) => ({ grupoDre, valor }))
    .sort((a, b) => b.valor - a.valor)
  const totalSaidas = saidasPorGrupoDre.reduce((s, g) => s + g.valor, 0)

  return {
    unidade,
    entradasPorCategoria,
    totalEntradas,
    saidasPorGrupoDre,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
  }
}
