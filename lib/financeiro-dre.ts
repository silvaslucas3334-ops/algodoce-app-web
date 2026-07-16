import { supabase } from './supabase'
import { CategoriaReceita } from './types'
import { CATEGORIA_RECEITA_LABEL } from './constants'

export type VisaoDre = 'loja1' | 'loja2' | 'consolidado'

export interface DreLinhaDetalhe {
  parteId: string
  parteNome: string
  grupoDre: string
  valor: number
}

export interface DreReceitaDetalhe {
  categoria: CategoriaReceita
  data: string
  valor: number // líquido recebido, o que bateu no extrato
  valorBruto: number | null
  observacao: string | null
}

export interface DreResultado {
  unidade: VisaoDre
  ano: number
  mes: number
  receitaBrutaPorCategoria: { categoria: CategoriaReceita; label: string; valor: number }[]
  totalReceitaBruta: number
  taxasDescontadas: { label: string; valor: number }[]
  totalTaxasDescontadas: number
  custoInsumosPorGrupoDre: { grupoDre: string; valor: number }[]
  totalCustoInsumos: number
  despesasPorGrupoDre: { grupoDre: string; valor: number }[]
  totalDespesas: number
  resultado: number
  percentualRateio: number | null // só preenchido quando unidade é loja1/loja2 — % do faturamento do mês que essa loja representa
  receitasDetalhadas: DreReceitaDetalhe[]
  despesasDetalhadas: DreLinhaDetalhe[]
  custoInsumosDetalhados: DreLinhaDetalhe[]
}

function somaPorGrupo(linhas: { grupoDre: string; valor: number }[]): { grupoDre: string; valor: number }[] {
  const mapa = new Map<string, number>()
  linhas.forEach((l) => mapa.set(l.grupoDre, (mapa.get(l.grupoDre) || 0) + l.valor))
  return Array.from(mapa.entries())
    .map(([grupoDre, valor]) => ({ grupoDre, valor }))
    .sort((a, b) => b.valor - a.valor)
}

/**
 * DRE do mês (regime de competência): espelha buscarFluxoCaixa
 * (lib/financeiro-receitas.ts), mas por data_competencia em vez de
 * data_pagamento, e sem excluir despesas ainda 'aberto' — só 'cancelado'
 * fica de fora (mesmo padrão da view financeiro_custo_medio_mensal).
 *
 * Só admin acessa esta tela (mesma RLS de financeiro_receitas), então as
 * queries abaixo buscam TODAS as unidades sempre — mesmo quando a visão
 * pedida é uma loja específica — porque o cálculo do rateio precisa do
 * faturamento das duas lojas no mês, não só da que está sendo exibida.
 */
export async function buscarDre(unidade: VisaoDre, ano: number, mes: number): Promise<DreResultado> {
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

  const [
    { data: receitas, error: erroReceitas },
    { data: despesas, error: erroDespesas },
    { data: comprasLancamentos, error: erroCompras },
  ] = await Promise.all([
    supabase
      .from('financeiro_receitas')
      .select('unidade, categoria, data, valor, valor_bruto, observacao')
      .gte('data', dataInicio)
      .lte('data', dataFim),
    supabase
      .from('financeiro_lancamentos')
      .select('valor_total, unidade, parte_id, parte:financeiro_partes!parte_id(nome), conta:financeiro_contas(grupo_dre)')
      .eq('tipo', 'despesa')
      .neq('status', 'cancelado')
      .gte('data_competencia', dataInicio)
      .lte('data_competencia', dataFim),
    supabase
      .from('financeiro_lancamentos')
      .select('id, unidade, parte_id, parte:financeiro_partes!parte_id(nome)')
      .eq('tipo', 'compra_insumos')
      .neq('status', 'cancelado')
      .gte('data_competencia', dataInicio)
      .lte('data_competencia', dataFim),
  ])
  if (erroReceitas) throw new Error(erroReceitas.message)
  if (erroDespesas) throw new Error(erroDespesas.message)
  if (erroCompras) throw new Error(erroCompras.message)

  const idsCompras = (comprasLancamentos || []).map((c: any) => c.id)
  const { data: itens, error: erroItens } =
    idsCompras.length > 0
      ? await supabase
          .from('financeiro_lancamento_itens')
          .select('lancamento_id, valor_total, conta:financeiro_contas(grupo_dre)')
          .in('lancamento_id', idsCompras)
      : { data: [], error: null }
  if (erroItens) throw new Error(erroItens.message)

  // Faturamento das duas lojas no mês — usado tanto pra exibir a Receita
  // Bruta da unidade selecionada quanto (sempre) pra calcular o % de rateio.
  const valorContabil = (r: any) => r.valor_bruto ?? r.valor
  const receitaLoja1 = (receitas || []).filter((r: any) => r.unidade === 'loja1').reduce((s: number, r: any) => s + valorContabil(r), 0)
  const receitaLoja2 = (receitas || []).filter((r: any) => r.unidade === 'loja2').reduce((s: number, r: any) => s + valorContabil(r), 0)
  const percentualRateio =
    unidade === 'consolidado'
      ? null
      : (() => {
          const total = receitaLoja1 + receitaLoja2
          const receitaUnidade = unidade === 'loja1' ? receitaLoja1 : receitaLoja2
          return total > 0 ? receitaUnidade / total : 0
        })()

  const receitasFiltradas = unidade === 'consolidado' ? receitas || [] : (receitas || []).filter((r: any) => r.unidade === unidade)

  const somaPorCategoria = new Map<CategoriaReceita, number>()
  Object.keys(CATEGORIA_RECEITA_LABEL).forEach((c) => somaPorCategoria.set(c as CategoriaReceita, 0))
  receitasFiltradas.forEach((r: any) => {
    somaPorCategoria.set(r.categoria, (somaPorCategoria.get(r.categoria) || 0) + valorContabil(r))
  })
  const receitaBrutaPorCategoria = Array.from(somaPorCategoria.entries()).map(([categoria, valor]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    valor,
  }))
  const totalReceitaBruta = receitaBrutaPorCategoria.reduce((s, c) => s + c.valor, 0)

  // Taxas descontadas no repasse: nunca viram lançamento, só existem aqui —
  // a diferença entre o que a maquininha/app processou e o que caiu líquido.
  const taxaCartao = receitasFiltradas
    .filter((r: any) => r.categoria === 'venda_cartao' && r.valor_bruto != null)
    .reduce((s: number, r: any) => s + (r.valor_bruto - r.valor), 0)
  const taxaApp = receitasFiltradas
    .filter((r: any) => (r.categoria === 'repasse_ifood' || r.categoria === 'repasse_aiqfome') && r.valor_bruto != null)
    .reduce((s: number, r: any) => s + (r.valor_bruto - r.valor), 0)
  const taxasDescontadas = [
    { label: 'Taxa de cartão', valor: taxaCartao },
    { label: 'Taxa de iFood/Aiqfome', valor: taxaApp },
  ].filter((t) => t.valor > 0)
  const totalTaxasDescontadas = taxasDescontadas.reduce((s, t) => s + t.valor, 0)

  const despesasDetalhadas: DreLinhaDetalhe[] = []
  ;(despesas || []).forEach((d: any) => {
    const linha: DreLinhaDetalhe = {
      parteId: d.parte_id,
      parteNome: d.parte?.nome || 'Sem beneficiário',
      grupoDre: d.conta?.grupo_dre || 'Sem classificação',
      valor: d.valor_total,
    }
    if (unidade === 'consolidado') {
      despesasDetalhadas.push(linha)
    } else if (d.unidade === unidade) {
      despesasDetalhadas.push(linha)
    } else if (d.unidade === 'rateio') {
      despesasDetalhadas.push({ ...linha, valor: linha.valor * (percentualRateio || 0) })
    }
  })
  const despesasPorGrupoDre = somaPorGrupo(despesasDetalhadas)
  const totalDespesas = despesasPorGrupoDre.reduce((s, g) => s + g.valor, 0)

  const compraPorLancamento = new Map((comprasLancamentos || []).map((c: any) => [c.id, c]))
  const custoInsumosDetalhados: DreLinhaDetalhe[] = (itens || [])
    .map((item: any) => {
      const lancamento: any = compraPorLancamento.get(item.lancamento_id)
      if (!lancamento) return null
      if (unidade !== 'consolidado' && lancamento.unidade !== unidade) return null
      return {
        parteId: lancamento.parte_id,
        parteNome: lancamento.parte?.nome || 'Sem fornecedor',
        grupoDre: item.conta?.grupo_dre || 'Sem classificação',
        valor: item.valor_total,
      }
    })
    .filter((i: DreLinhaDetalhe | null): i is DreLinhaDetalhe => i !== null)
  const custoInsumosPorGrupoDre = somaPorGrupo(custoInsumosDetalhados)
  const totalCustoInsumos = custoInsumosPorGrupoDre.reduce((s, g) => s + g.valor, 0)

  const receitasDetalhadas: DreReceitaDetalhe[] = receitasFiltradas.map((r: any) => ({
    categoria: r.categoria,
    data: r.data,
    valor: r.valor,
    valorBruto: r.valor_bruto ?? null,
    observacao: r.observacao,
  }))

  return {
    unidade,
    ano,
    mes,
    receitaBrutaPorCategoria,
    totalReceitaBruta,
    taxasDescontadas,
    totalTaxasDescontadas,
    custoInsumosPorGrupoDre,
    totalCustoInsumos,
    despesasPorGrupoDre,
    totalDespesas,
    resultado: totalReceitaBruta - totalTaxasDescontadas - totalCustoInsumos - totalDespesas,
    percentualRateio,
    receitasDetalhadas,
    despesasDetalhadas,
    custoInsumosDetalhados,
  }
}
