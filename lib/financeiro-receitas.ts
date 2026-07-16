import { supabase } from './supabase'
import { CategoriaReceita, FinanceiroExtratoTransacao } from './types'
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
  usuarioId: string,
  valorBruto?: number
): Promise<void> {
  const { error: erroReceita } = await supabase.from('financeiro_receitas').insert({
    unidade,
    categoria,
    data,
    valor,
    valor_bruto: valorBruto ?? null,
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
 * Categoriza várias transações de uma vez com a MESMA categoria (ex: um
 * dia inteiro de vendas no PIX). Sequencial, não Promise.all — evita
 * disparar dezenas de INSERT+UPDATE simultâneos, e cada falha individual
 * não derruba o restante do lote (relatada em `falhas`, o usuário resolve
 * as que sobrarem pelo fluxo de categorização individual).
 */
export async function categorizarReceitasEmLote(
  transacoes: FinanceiroExtratoTransacao[],
  categoria: Exclude<CategoriaReceita, 'dinheiro'>,
  usuarioId: string,
  onProgress?: (concluidas: number, total: number) => void
): Promise<{ sucesso: number; falhas: { transacao: FinanceiroExtratoTransacao; erro: string }[] }> {
  const falhas: { transacao: FinanceiroExtratoTransacao; erro: string }[] = []
  let sucesso = 0
  for (let i = 0; i < transacoes.length; i++) {
    const t = transacoes[i]
    try {
      await categorizarReceita(t.id, t.conta_bancaria as 'loja1' | 'loja2', categoria, t.valor, t.data, null, usuarioId)
      sucesso++
    } catch (err: any) {
      falhas.push({ transacao: t, erro: err?.message || 'desconhecido' })
    }
    onProgress?.(i + 1, transacoes.length)
  }
  return { sucesso, falhas }
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

export type VisaoFluxoCaixa = 'loja1' | 'loja2' | 'consolidado'

export interface FluxoCaixaDespesaDetalhe {
  parteId: string
  parteNome: string
  grupoDre: string
  valor: number
}

export interface FluxoCaixaReceitaDetalhe {
  categoria: CategoriaReceita
  data: string
  valor: number
  observacao: string | null
}

export interface FluxoCaixaMensal {
  unidade: VisaoFluxoCaixa
  entradasPorCategoria: { categoria: CategoriaReceita; label: string; valor: number }[]
  totalEntradas: number
  saidasPorGrupoDre: { grupoDre: string; valor: number }[]
  totalSaidas: number
  saldo: number
  despesasDetalhadas: FluxoCaixaDespesaDetalhe[]
  receitasDetalhadas: FluxoCaixaReceitaDetalhe[]
}

/**
 * Fluxo de caixa do período: entradas (financeiro_receitas) x saídas
 * (financeiro_lancamentos pagas, por data_pagamento — é caixa, não
 * competência). dataInicio/dataFim são strings AAAA-MM-DD — quem chama
 * decide a granularidade (dia, mês, intervalo livre), a lib só agrega.
 *
 * Visão por unidade (loja1/loja2) exclui despesas 'rateio' de propósito —
 * responde "quanto essa loja gastou/ganhou sozinha", uma pergunta de
 * competência (a quem pertence o custo). Visão 'consolidado' soma
 * loja1+loja2+rateio: em regime de caixa, rateio é indiferente — o
 * dinheiro sai de alguma conta de qualquer forma, então pra saber o
 * caixa real da empresa como um todo ele PRECISA entrar na soma.
 *
 * despesasDetalhadas/receitasDetalhadas expõem as linhas cruas por trás
 * dos agregados (pro drill-down por linha na tela) — vêm dos MESMOS
 * arrays já buscados aqui, não de uma query separada, então nunca
 * divergem dos totais mostrados.
 */
export async function buscarFluxoCaixa(
  unidade: VisaoFluxoCaixa,
  dataInicio: string,
  dataFim: string
): Promise<FluxoCaixaMensal> {
  let receitasQuery = supabase
    .from('financeiro_receitas')
    .select('categoria, data, valor, observacao')
    .gte('data', dataInicio)
    .lte('data', dataFim)
  let despesasQuery = supabase
    .from('financeiro_lancamentos')
    .select('valor_total, parte_id, parte:financeiro_partes!parte_id(nome), conta:financeiro_contas(grupo_dre)')
    .eq('status', 'pago')
    .gte('data_pagamento', dataInicio)
    .lte('data_pagamento', dataFim)
  if (unidade !== 'consolidado') {
    // financeiro_receitas nunca tem unidade='rateio' (receita é sempre de
    // uma loja específica), então só as saídas precisam desse filtro.
    receitasQuery = receitasQuery.eq('unidade', unidade)
    despesasQuery = despesasQuery.eq('unidade', unidade)
  }

  const [{ data: receitas, error: erroReceitas }, { data: despesas, error: erroDespesas }] = await Promise.all([
    receitasQuery,
    despesasQuery,
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

  const despesasDetalhadas: FluxoCaixaDespesaDetalhe[] = (despesas || []).map((d: any) => ({
    parteId: d.parte_id,
    parteNome: d.parte?.nome || 'Sem beneficiário',
    grupoDre: d.conta?.grupo_dre || 'Sem classificação',
    valor: d.valor_total,
  }))
  const receitasDetalhadas: FluxoCaixaReceitaDetalhe[] = (receitas || []).map((r: any) => ({
    categoria: r.categoria,
    data: r.data,
    valor: r.valor,
    observacao: r.observacao,
  }))

  return {
    unidade,
    entradasPorCategoria,
    totalEntradas,
    saidasPorGrupoDre,
    totalSaidas,
    saldo: totalEntradas - totalSaidas,
    despesasDetalhadas,
    receitasDetalhadas,
  }
}
