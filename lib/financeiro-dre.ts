import { supabase } from './supabase'
import { CategoriaReceita, FinanceiroConta, LinhaDre } from './types'
import { CATEGORIA_RECEITA_LABEL, LINHA_DRE_LABEL } from './constants'

export type VisaoDre = 'loja1' | 'loja2' | 'consolidado'

export interface DreLinhaDetalhe {
  parteId: string
  parteNome: string
  contaId: string
  valor: number
}

export interface DreReceitaDetalhe {
  categoria: CategoriaReceita
  data: string
  valor: number // líquido recebido, o que bateu no extrato
  valorBruto: number | null
  observacao: string | null
}

export interface DreContaValor {
  contaId: string
  codigo: string
  nome: string
  valor: number
  notaZerado?: string // preenchido só pra conta afeta_dre=false (hoje: 3002)
}

export interface DreSecao {
  linha: LinhaDre | 'nao_classificado'
  label: string
  contas: DreContaValor[]
  total: number
  // Análise vertical: % sobre Receita Líquida, exceto na própria seção de
  // Deduções de Vendas (que ainda não existe Receita Líquida pra dividir
  // por ela) — ali é % sobre Receita Bruta.
  percentual: number | null
}

export interface DreResultado {
  unidade: VisaoDre
  ano: number
  mes: number

  receitaBrutaPorCategoria: { categoria: CategoriaReceita; label: string; valor: number }[]
  totalReceitaBruta: number

  secaoDeducaoVendas: DreSecao
  totalReceitaLiquida: number

  secaoCmv: DreSecao
  secaoMaoObra: DreSecao
  totalLucroBruto: number

  secaoDespesasOperacionais: DreSecao
  totalResultadoOperacional: number

  secaoResultadoFinanceiro: DreSecao
  totalLucroLiquidoAntesDistribuicao: number

  secaoDistribuicaoLucros: DreSecao
  resultado: number // RESULTADO LÍQUIDO DO PERÍODO

  // Contas com lançamento no período mas sem linha_dre classificada — não
  // deveria acontecer com o plano de contas seedado, mas se alguém cadastrar
  // uma conta nova sem classificar, ela cai aqui em vez de sumir do
  // resultado silenciosamente. Só aparece na tela quando tem algo dentro.
  secaoNaoClassificada: DreSecao

  percentualRateio: number | null // só preenchido quando unidade é loja1/loja2 — % do faturamento do mês que essa loja representa
  // Resgates de contas de reserva (afeta_dre=false) — informativo, fora do
  // resultado do mês: não é venda, é a própria reserva voltando pro caixa.
  totalResgatesAplicacao: number
  // Aportes lançados em contas de reserva (afeta_dre=false) — informativo,
  // fora do resultado do mês pelo mesmo motivo (não é despesa real).
  totalAportesReserva: number
  receitasDetalhadas: DreReceitaDetalhe[]
  linhasDetalhadas: DreLinhaDetalhe[] // despesas + itens de compra, por conta — alimenta o drilldown por conta
  aportesReservaDetalhados: DreLinhaDetalhe[]
}

/**
 * DRE do mês em cascata (regime de competência): Receita Bruta → Líquida →
 * Lucro Bruto → Resultado Operacional → Resultado Financeiro → Lucro
 * Líquido, seguindo a classificação linha_dre de cada conta do plano de
 * contas (ver lib/migrations/financeiro-dre-cascata.sql). Espelha
 * buscarFluxoCaixa (lib/financeiro-receitas.ts) na parte de receitas: por
 * data_competencia em vez de data_pagamento, e sem excluir despesas ainda
 * 'aberto' — só 'cancelado' fica de fora.
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
    { data: contasData, error: erroContas },
    { data: receitas, error: erroReceitas },
    { data: despesas, error: erroDespesas },
    { data: comprasLancamentos, error: erroCompras },
  ] = await Promise.all([
    supabase.from('financeiro_contas').select('id, codigo, nome, linha_dre, afeta_dre'),
    supabase
      .from('financeiro_receitas')
      .select('unidade, categoria, data, valor, valor_bruto, observacao')
      .gte('data', dataInicio)
      .lte('data', dataFim),
    supabase
      .from('financeiro_lancamentos')
      .select('valor_total, unidade, parte_id, conta_id, parte:financeiro_partes!parte_id(nome)')
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
  if (erroContas) throw new Error(erroContas.message)
  if (erroReceitas) throw new Error(erroReceitas.message)
  if (erroDespesas) throw new Error(erroDespesas.message)
  if (erroCompras) throw new Error(erroCompras.message)

  const contas = (contasData || []) as FinanceiroConta[]
  const contasPorId = new Map(contas.map((c) => [c.id, c]))

  const idsCompras = (comprasLancamentos || []).map((c: any) => c.id)
  const { data: itens, error: erroItens } =
    idsCompras.length > 0
      ? await supabase.from('financeiro_lancamento_itens').select('lancamento_id, valor_total, conta_id').in('lancamento_id', idsCompras)
      : { data: [], error: null }
  if (erroItens) throw new Error(erroItens.message)

  // Faturamento das duas lojas no mês — usado tanto pra exibir a Receita
  // Bruta da unidade selecionada quanto (sempre) pra calcular o % de rateio.
  // Resgate de aplicação nunca entra aqui — não é venda, distorceria o rateio.
  const valorContabil = (r: any) => r.valor_bruto ?? r.valor
  const receitasVenda = (receitas || []).filter((r: any) => r.categoria !== 'resgate_aplicacao')
  const receitaLoja1 = receitasVenda.filter((r: any) => r.unidade === 'loja1').reduce((s: number, r: any) => s + valorContabil(r), 0)
  const receitaLoja2 = receitasVenda.filter((r: any) => r.unidade === 'loja2').reduce((s: number, r: any) => s + valorContabil(r), 0)
  const percentualRateio =
    unidade === 'consolidado'
      ? null
      : (() => {
          const total = receitaLoja1 + receitaLoja2
          const receitaUnidade = unidade === 'loja1' ? receitaLoja1 : receitaLoja2
          return total > 0 ? receitaUnidade / total : 0
        })()

  const receitasFiltradas = unidade === 'consolidado' ? receitas || [] : (receitas || []).filter((r: any) => r.unidade === unidade)
  const receitasFiltradasVenda = receitasFiltradas.filter((r: any) => r.categoria !== 'resgate_aplicacao')

  const somaPorCategoria = new Map<CategoriaReceita, number>()
  Object.keys(CATEGORIA_RECEITA_LABEL)
    .filter((c) => c !== 'resgate_aplicacao')
    .forEach((c) => somaPorCategoria.set(c as CategoriaReceita, 0))
  receitasFiltradasVenda.forEach((r: any) => {
    somaPorCategoria.set(r.categoria, (somaPorCategoria.get(r.categoria) || 0) + valorContabil(r))
  })
  const receitaBrutaPorCategoria = Array.from(somaPorCategoria.entries()).map(([categoria, valor]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    valor,
  }))
  const totalReceitaBruta = receitaBrutaPorCategoria.reduce((s, c) => s + c.valor, 0)

  const totalResgatesAplicacao = receitasFiltradas
    .filter((r: any) => r.categoria === 'resgate_aplicacao')
    .reduce((s: number, r: any) => s + valorContabil(r), 0)

  // Taxas descontadas no repasse: nunca viram lançamento, só existem aqui —
  // a diferença entre o que a maquininha/app processou e o que caiu líquido.
  // Entram na cascata como linhas "sintéticas" (sem conta) dentro de
  // Deduções de Vendas, somadas a eventuais lançamentos reais em 2001/2003/
  // 2004/2005 — sem risco de contar duas vezes, as duas fontes já eram
  // subtraídas do resultado antes desta reestruturação.
  const taxaCartao = receitasFiltradasVenda
    .filter((r: any) => r.categoria === 'venda_cartao' && r.valor_bruto != null)
    .reduce((s: number, r: any) => s + (r.valor_bruto - r.valor), 0)
  const taxaApp = receitasFiltradasVenda
    .filter((r: any) => (r.categoria === 'repasse_ifood' || r.categoria === 'repasse_aiqfome') && r.valor_bruto != null)
    .reduce((s: number, r: any) => s + (r.valor_bruto - r.valor), 0)

  // --- Classificação de despesas e itens de compra por conta ---------------
  const linhasDetalhadas: DreLinhaDetalhe[] = []
  const aportesReservaDetalhados: DreLinhaDetalhe[] = []
  const valorPorConta = new Map<string, number>()

  // Conta de reserva (afeta_dre=false, hoje só 3002): o valor vai pro balde
  // informativo de Aportes em Reserva, não entra na cascata do resultado.
  // conta_id é opcional no banco (lançamento antigo ou sem classificação) —
  // cai no pseudo-id 'sem-conta', que vira parte da seção "Não classificado"
  // mais abaixo, pro valor nunca sumir do resultado silenciosamente.
  function acumular(contaId: string | null | undefined, valor: number, parteId: string, parteNome: string) {
    const chave = contaId || 'sem-conta'
    const linha: DreLinhaDetalhe = { parteId, parteNome, contaId: chave, valor }
    const conta = contaId ? contasPorId.get(contaId) : undefined
    if (conta?.afeta_dre === false) {
      aportesReservaDetalhados.push(linha)
      return
    }
    valorPorConta.set(chave, (valorPorConta.get(chave) || 0) + valor)
    linhasDetalhadas.push(linha)
  }

  ;(despesas || []).forEach((d: any) => {
    const parteNome = d.parte?.nome || 'Sem beneficiário'
    if (unidade === 'consolidado' || d.unidade === unidade) {
      acumular(d.conta_id, d.valor_total, d.parte_id, parteNome)
    } else if (d.unidade === 'rateio') {
      acumular(d.conta_id, d.valor_total * (percentualRateio || 0), d.parte_id, parteNome)
    }
  })

  const compraPorLancamento = new Map((comprasLancamentos || []).map((c: any) => [c.id, c]))
  ;(itens || []).forEach((item: any) => {
    const lancamento: any = compraPorLancamento.get(item.lancamento_id)
    if (!lancamento) return
    if (unidade !== 'consolidado' && lancamento.unidade !== unidade) return
    acumular(item.conta_id, item.valor_total, lancamento.parte_id, lancamento.parte?.nome || 'Sem fornecedor')
  })

  const totalAportesReserva = aportesReservaDetalhados.reduce((s, l) => s + l.valor, 0)

  function contasDaLinha(linha: LinhaDre): DreContaValor[] {
    return contas
      .filter((c) => c.linha_dre === linha)
      .map((c) => ({
        contaId: c.id,
        codigo: c.codigo,
        nome: c.nome,
        valor: c.afeta_dre === false ? 0 : valorPorConta.get(c.id) || 0,
        notaZerado: c.afeta_dre === false ? 'Tratado como reserva — ver Aportes em Reserva' : undefined,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
  }

  function montarSecao(linha: LinhaDre, contasArr: DreContaValor[], base: number): DreSecao {
    const total = contasArr.reduce((s, c) => s + c.valor, 0)
    return { linha, label: LINHA_DRE_LABEL[linha], contas: contasArr, total, percentual: base > 0 ? (total / base) * 100 : null }
  }

  function montarSecaoNaoClassificada(contasArr: DreContaValor[], base: number): DreSecao {
    const total = contasArr.reduce((s, c) => s + c.valor, 0)
    return { linha: 'nao_classificado', label: 'Não classificado', contas: contasArr, total, percentual: base > 0 ? (total / base) * 100 : null }
  }

  const taxasSinteticas: DreContaValor[] = [
    { contaId: 'sintetico-cartao', codigo: '—', nome: 'Taxa de cartão (repasse)', valor: taxaCartao },
    { contaId: 'sintetico-app', codigo: '—', nome: 'Taxa de iFood/Aiqfome (repasse)', valor: taxaApp },
  ].filter((t) => t.valor > 0)

  const secaoDeducaoVendas = montarSecao('deducao_vendas', [...taxasSinteticas, ...contasDaLinha('deducao_vendas')], totalReceitaBruta)
  const totalReceitaLiquida = totalReceitaBruta - secaoDeducaoVendas.total

  const secaoCmv = montarSecao('cmv', contasDaLinha('cmv'), totalReceitaLiquida)
  const secaoMaoObra = montarSecao('mao_obra_encargos', contasDaLinha('mao_obra_encargos'), totalReceitaLiquida)
  const totalLucroBruto = totalReceitaLiquida - secaoCmv.total - secaoMaoObra.total

  const secaoDespesasOperacionais = montarSecao('despesas_operacionais', contasDaLinha('despesas_operacionais'), totalReceitaLiquida)
  const totalResultadoOperacional = totalLucroBruto - secaoDespesasOperacionais.total

  const secaoResultadoFinanceiro = montarSecao('resultado_financeiro', contasDaLinha('resultado_financeiro'), totalReceitaLiquida)
  const totalLucroLiquidoAntesDistribuicao = totalResultadoOperacional - secaoResultadoFinanceiro.total

  const secaoDistribuicaoLucros = montarSecao('distribuicao_lucros', contasDaLinha('distribuicao_lucros'), totalReceitaLiquida)

  // Rede de segurança: lançamento sem conta_id, ou com conta_id apontando
  // pra uma conta sem linha_dre (não deveria existir com o plano seedado —
  // só cobre um cadastro novo/legado sem classificação). Entra no
  // resultado pra nunca sumir dinheiro silenciosamente, mas fica isolada
  // da cascata "oficial".
  const valorSemConta = valorPorConta.get('sem-conta') || 0
  const contasNaoClassificadas: DreContaValor[] = [
    ...(valorSemConta !== 0 ? [{ contaId: 'sem-conta', codigo: '—', nome: 'Sem conta contábil' }] : []),
    ...contas.filter((c) => !c.linha_dre && c.afeta_dre !== false && (valorPorConta.get(c.id) || 0) !== 0),
  ].map((c: any) => ({ contaId: c.contaId ?? c.id, codigo: c.codigo, nome: c.nome, valor: valorPorConta.get(c.contaId ?? c.id) || 0 }))
  const secaoNaoClassificada = montarSecaoNaoClassificada(contasNaoClassificadas, totalReceitaLiquida)

  const resultado =
    totalLucroLiquidoAntesDistribuicao - secaoDistribuicaoLucros.total - secaoNaoClassificada.total

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
    secaoDeducaoVendas,
    totalReceitaLiquida,
    secaoCmv,
    secaoMaoObra,
    totalLucroBruto,
    secaoDespesasOperacionais,
    totalResultadoOperacional,
    secaoResultadoFinanceiro,
    totalLucroLiquidoAntesDistribuicao,
    secaoDistribuicaoLucros,
    resultado,
    secaoNaoClassificada,
    percentualRateio,
    totalResgatesAplicacao,
    totalAportesReserva,
    receitasDetalhadas,
    linhasDetalhadas,
    aportesReservaDetalhados,
  }
}
