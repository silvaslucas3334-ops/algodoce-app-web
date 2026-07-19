import { supabase } from './supabase'
import { CategoriaReceita, TipoLancamento } from './types'
import { CATEGORIA_RECEITA_LABEL } from './constants'
import { buscarPedidosDoPeriodo, gerarItensVendidosFlat } from './pdv-report'
import {
  Cenario,
  CENARIO_MULTIPLICADOR,
  PontoHistorico,
  calcularMediaPorDiaSemana,
  calcularParticipacaoPorDiaSemana,
  distribuirValorPorDiaSemana,
  inicioJanelaHistorico,
} from './financeiro-forecast'
import { hojeISO } from './financeiro-utils'
import { buscarOrcamento } from './financeiro-orcamento'

export type VisaoFluxoMensal = 'loja1' | 'loja2' | 'rateio' | 'consolidado'

export interface FluxoMensalLinhaGrupo {
  id: string
  nome: string
  porDia: number[]
  total: number
}

export interface FluxoMensalOrcadoRealizado {
  id: string
  nome: string
  previsto: number
  projetado: number // realizado + conhecido-futuro (+ projeção de recorrência, se fixo)
  cor: 'azul' | 'laranja' | 'verde'
}

export interface FluxoMensalResultado {
  unidade: VisaoFluxoMensal
  ano: number
  mes: number
  cenario: Cenario
  dias: string[]

  faturamentoAplicavel: boolean
  faturamentoPorDia: (number | null)[]
  faturamentoEhForecastPorDia: boolean[]
  metaMensal: number | null
  metaDiariaPorDia: (number | null)[]
  deltaPorDia: (number | null)[]
  gapAcumuladoPorDia: (number | null)[]

  entradasCaixaPorDia: number[]
  entradasCaixaEhForecastPorDia: boolean[]
  entradasCaixaPorCategoria: { categoria: CategoriaReceita; label: string; total: number }[]
  totalEntradasCaixa: number

  saidasFixoPorDia: number[]
  saidasFixoPorConta: FluxoMensalLinhaGrupo[]
  totalSaidasFixo: number

  saidasVariavelPorDia: number[]
  saidasVariavelPorFornecedor: FluxoMensalLinhaGrupo[]
  totalSaidasVariavel: number

  saldoDiaPorDia: number[]
  saldoInicial: number | null
  saldoAcumuladoPorDia: number[]

  orcadoXRealizadoFixo: FluxoMensalOrcadoRealizado[]
  orcadoXRealizadoVariavel: FluxoMensalOrcadoRealizado[]
}

// --- utilitários de data ----------------------------------------------------

function diasDoMes(ano: number, mes: number): string[] {
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return Array.from({ length: ultimoDia }, (_, i) => `${ano}-${String(mes).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
}

function primeiroEUltimoDia(ano: number, mes: number): { inicio: string; fim: string } {
  const dias = diasDoMes(ano, mes)
  return { inicio: dias[0], fim: dias[dias.length - 1] }
}

function diaOcorrenciaRecorrencia(ano: number, mes: number, diaVencimento: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(diaVencimento).padStart(2, '0')}`
}

/**
 * Cor da comparação orçado x realizado — inverte por tipo: numa despesa,
 * gastar mais que o previsto é ruim (laranja); numa receita, faturar mais
 * é bom (verde). ±2% de folga conta como "bateu em cima" (azul).
 */
function corComparacao(previsto: number, projetado: number, tipo: 'receita' | 'despesa'): 'azul' | 'laranja' | 'verde' {
  if (previsto === 0) return 'azul'
  const diferenca = (projetado - previsto) / previsto
  const TOLERANCIA = 0.02
  if (Math.abs(diferenca) <= TOLERANCIA) return 'azul'
  if (tipo === 'despesa') return diferenca > 0 ? 'laranja' : 'verde'
  return diferenca > 0 ? 'verde' : 'laranja'
}

// --- Faturamento (PDV) por loja ---------------------------------------------

async function buscarFaturamentoLoja(
  loja: 'loja1' | 'loja2',
  ano: number,
  mes: number,
  dias: string[],
  hoje: string,
  cenario: Cenario
): Promise<{ porDia: (number | null)[]; ehForecastPorDia: boolean[]; participacaoPorDiaSemana: number[] }> {
  const { inicio, fim } = primeiroEUltimoDia(ano, mes)
  const inicioHistorico = inicioJanelaHistorico(hoje)
  const fimReal = fim < hoje ? fim : hoje

  const [pedidosMes, pedidosHistorico] = await Promise.all([
    inicio <= hoje ? buscarPedidosDoPeriodo(loja, inicio, fimReal) : Promise.resolve([]),
    buscarPedidosDoPeriodo(loja, inicioHistorico, hoje),
  ])

  function agruparPorDia(pedidos: typeof pedidosMes): Map<string, number> {
    const grupos = new Map<string, typeof pedidosMes>()
    pedidos.forEach((p) => {
      if (!grupos.has(p.data_periodo)) grupos.set(p.data_periodo, [])
      grupos.get(p.data_periodo)!.push(p)
    })
    const totais = new Map<string, number>()
    grupos.forEach((pedidosDoDia, data) => {
      const flat = gerarItensVendidosFlat(pedidosDoDia)
      totais.set(data, flat.reduce((s, l) => s + l.valorFinal, 0))
    })
    return totais
  }

  const porDiaReal = agruparPorDia(pedidosMes)
  const totaisHistorico = agruparPorDia(pedidosHistorico)
  const pontosHistoricos: PontoHistorico[] = Array.from(totaisHistorico.entries()).map(([data, valor]) => ({ data, valor }))

  const mediaPorDiaSemana = calcularMediaPorDiaSemana(pontosHistoricos)
  const participacaoPorDiaSemana = calcularParticipacaoPorDiaSemana(pontosHistoricos)

  const porDia: (number | null)[] = []
  const ehForecastPorDia: boolean[] = []
  dias.forEach((dia) => {
    if (dia <= hoje) {
      porDia.push(porDiaReal.get(dia) ?? 0)
      ehForecastPorDia.push(false)
    } else {
      const media = mediaPorDiaSemana[new Date(dia + 'T00:00:00').getDay()]
      porDia.push(media != null ? media * CENARIO_MULTIPLICADOR[cenario] : null)
      ehForecastPorDia.push(true)
    }
  })

  return { porDia, ehForecastPorDia, participacaoPorDiaSemana }
}

// --- função principal --------------------------------------------------------

/**
 * Visão mensal do Fluxo de Caixa: Faturamento (PDV) x Meta de Venda,
 * Entradas de Caixa (financeiro_receitas), Saídas Custo Fixo/Variável
 * (financeiro_lancamentos), saldo diário/acumulado e a comparação orçado x
 * realizado do mês. Ver plano em C:\Users\silva\.claude\plans — 3 acertos
 * importantes: (1) projeção de recorrência por existência de lançamento no
 * mês, nunca por proxima_data; (2) aberto vencido nunca conta como
 * "realizado" num dia passado (isso é o que buscarAtrasados cobre); (3)
 * Meta Diária/Faturamento/GAP são 3 séries distintas, não uma só.
 */
export async function buscarFluxoMensal(
  unidade: VisaoFluxoMensal,
  ano: number,
  mes: number,
  cenario: Cenario
): Promise<FluxoMensalResultado> {
  const dias = diasDoMes(ano, mes)
  const { inicio, fim } = primeiroEUltimoDia(ano, mes)
  const hoje = hojeISO()

  // --- Faturamento / Meta / Delta / GAP -------------------------------------
  const faturamentoAplicavel = unidade !== 'rateio'
  let faturamentoPorDia: (number | null)[] = dias.map(() => null)
  let faturamentoEhForecastPorDia: boolean[] = dias.map(() => false)
  let metaMensal: number | null = null
  let metaDiariaPorDia: (number | null)[] = dias.map(() => null)

  if (faturamentoAplicavel) {
    const lojas: ('loja1' | 'loja2')[] = unidade === 'consolidado' ? ['loja1', 'loja2'] : [unidade as 'loja1' | 'loja2']
    const resultadosPorLoja = await Promise.all(lojas.map((l) => buscarFaturamentoLoja(l, ano, mes, dias, hoje, cenario)))

    faturamentoPorDia = dias.map((_, i) => {
      const valores = resultadosPorLoja.map((r) => r.porDia[i])
      if (valores.some((v) => v == null)) return null
      return valores.reduce((s: number, v) => s + (v as number), 0)
    })
    faturamentoEhForecastPorDia = dias.map((_, i) => resultadosPorLoja.some((r) => r.ehForecastPorDia[i]))

    const orcamentosLojas = await Promise.all(lojas.map((l) => buscarOrcamento(ano, mes, l)))
    const metasDefinidas = orcamentosLojas.every((o) => o?.valor_meta_venda != null)
    if (metasDefinidas) {
      metaMensal = orcamentosLojas.reduce((s, o) => s + (o!.valor_meta_venda || 0), 0)
      const participacaoCombinada = new Array(7).fill(0)
      resultadosPorLoja.forEach((r, i) => {
        const peso = metaMensal! > 0 ? (orcamentosLojas[i]!.valor_meta_venda || 0) / metaMensal! : 1 / lojas.length
        r.participacaoPorDiaSemana.forEach((p, diaSemana) => {
          participacaoCombinada[diaSemana] += p * peso
        })
      })
      metaDiariaPorDia = distribuirValorPorDiaSemana(metaMensal, participacaoCombinada, dias)
    }
  }

  const deltaPorDia = dias.map((_, i) =>
    faturamentoPorDia[i] != null && metaDiariaPorDia[i] != null ? faturamentoPorDia[i]! - metaDiariaPorDia[i]! : null
  )
  let gapCorrente: number | null = 0
  const gapAcumuladoPorDia = deltaPorDia.map((delta) => {
    if (gapCorrente == null || delta == null) {
      gapCorrente = null
    } else {
      gapCorrente = gapCorrente + delta
    }
    return gapCorrente
  })

  // --- Entradas de Caixa -----------------------------------------------------
  const unidadesReceita: ('loja1' | 'loja2')[] =
    unidade === 'consolidado' ? ['loja1', 'loja2'] : unidade === 'rateio' ? [] : [unidade as 'loja1' | 'loja2']

  let receitasReais: any[] = []
  let receitasHistorico: any[] = []
  if (unidadesReceita.length > 0) {
    const inicioHistoricoReceitas = inicioJanelaHistorico(hoje)
    const [{ data: reais, error: erroReais }, { data: historico, error: erroHistorico }] = await Promise.all([
      supabase.from('financeiro_receitas').select('unidade, categoria, data, valor').in('unidade', unidadesReceita).gte('data', inicio).lte('data', fim),
      supabase.from('financeiro_receitas').select('unidade, data, valor').in('unidade', unidadesReceita).gte('data', inicioHistoricoReceitas).lte('data', hoje),
    ])
    if (erroReais) throw new Error(erroReais.message)
    if (erroHistorico) throw new Error(erroHistorico.message)
    receitasReais = reais || []
    receitasHistorico = historico || []
  }

  const mediaPorLojaEntradas = new Map<string, (number | null)[]>()
  unidadesReceita.forEach((loja) => {
    const pontosPorDia = new Map<string, number>()
    receitasHistorico
      .filter((r) => r.unidade === loja)
      .forEach((r) => pontosPorDia.set(r.data, (pontosPorDia.get(r.data) || 0) + r.valor))
    const pontos: PontoHistorico[] = Array.from(pontosPorDia.entries()).map(([data, valor]) => ({ data, valor }))
    mediaPorLojaEntradas.set(loja, calcularMediaPorDiaSemana(pontos))
  })

  const realEntradasPorDia = new Map<string, number>()
  receitasReais.forEach((r) => realEntradasPorDia.set(r.data, (realEntradasPorDia.get(r.data) || 0) + r.valor))

  const entradasCaixaPorDia: number[] = []
  const entradasCaixaEhForecastPorDia: boolean[] = []
  dias.forEach((dia) => {
    if (dia <= hoje || unidadesReceita.length === 0) {
      entradasCaixaPorDia.push(realEntradasPorDia.get(dia) || 0)
      entradasCaixaEhForecastPorDia.push(false)
    } else {
      const diaSemana = new Date(dia + 'T00:00:00').getDay()
      let soma = 0
      unidadesReceita.forEach((loja) => {
        const media = mediaPorLojaEntradas.get(loja)?.[diaSemana]
        if (media != null) soma += media * CENARIO_MULTIPLICADOR[cenario]
      })
      entradasCaixaPorDia.push(soma)
      entradasCaixaEhForecastPorDia.push(true)
    }
  })

  const somaPorCategoria = new Map<CategoriaReceita, number>()
  Object.keys(CATEGORIA_RECEITA_LABEL).forEach((c) => somaPorCategoria.set(c as CategoriaReceita, 0))
  receitasReais.forEach((r) => somaPorCategoria.set(r.categoria, (somaPorCategoria.get(r.categoria) || 0) + r.valor))
  const entradasCaixaPorCategoria = Array.from(somaPorCategoria.entries()).map(([categoria, total]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    total,
  }))
  const totalEntradasCaixa = entradasCaixaPorDia.reduce((s, v) => s + v, 0)

  // --- Saídas (Custo Fixo + Custo Variável) ----------------------------------
  const unidadesDespesa = unidade === 'consolidado' ? ['loja1', 'loja2', 'rateio'] : [unidade]

  const [{ data: pagos, error: erroPagos }, { data: abertosFuturos, error: erroAbertos }, { data: recorrenciasAtivas, error: erroRecorrencias }] =
    await Promise.all([
      supabase
        .from('financeiro_lancamentos')
        .select('valor_total, tipo, parte_id, parte:financeiro_partes!parte_id(nome), conta_id, conta:financeiro_contas(nome), data_pagamento, recorrencia_id')
        .in('unidade', unidadesDespesa)
        .eq('status', 'pago')
        .gte('data_pagamento', inicio)
        .lte('data_pagamento', fim),
      supabase
        .from('financeiro_lancamentos')
        .select('valor_total, tipo, parte_id, parte:financeiro_partes!parte_id(nome), conta_id, conta:financeiro_contas(nome), data_vencimento, recorrencia_id')
        .in('unidade', unidadesDespesa)
        .eq('status', 'aberto')
        .gte('data_vencimento', hoje)
        .lte('data_vencimento', fim),
      supabase
        .from('financeiro_recorrencias')
        .select('id, valor, dia_vencimento, parte_id, parte:financeiro_partes(nome), conta_id, conta:financeiro_contas(nome)')
        .in('unidade', unidadesDespesa)
        .eq('ativa', true),
    ])
  if (erroPagos) throw new Error(erroPagos.message)
  if (erroAbertos) throw new Error(erroAbertos.message)
  if (erroRecorrencias) throw new Error(erroRecorrencias.message)

  // Recorrências já materializadas neste mês (qualquer status) não podem
  // ser projetadas de novo — dupla contagem.
  const idsRecorrenciasAtivas = (recorrenciasAtivas || []).map((r: any) => r.id)
  let recorrenciasJaMaterializadas = new Set<string>()
  if (idsRecorrenciasAtivas.length > 0) {
    const { data: jaLancadas, error: erroJaLancadas } = await supabase
      .from('financeiro_lancamentos')
      .select('recorrencia_id')
      .in('recorrencia_id', idsRecorrenciasAtivas)
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim)
    if (erroJaLancadas) throw new Error(erroJaLancadas.message)
    recorrenciasJaMaterializadas = new Set((jaLancadas || []).map((l: any) => l.recorrencia_id))
  }

  interface LinhaSaida {
    data: string
    valor: number
    parteId: string
    parteNome: string
    contaId: string
    contaNome: string
  }

  const linhasFixo: LinhaSaida[] = []
  const linhasVariavel: LinhaSaida[] = []

  function empilhar(lancamentos: any[], campoData: 'data_pagamento' | 'data_vencimento') {
    lancamentos.forEach((l) => {
      const linha: LinhaSaida = {
        data: l[campoData],
        valor: l.valor_total,
        parteId: l.parte_id || 'sem-parte',
        parteNome: l.parte?.nome || 'Sem beneficiário',
        contaId: l.conta_id || 'sem-conta',
        contaNome: l.conta?.nome || 'Sem classificação',
      }
      if (l.tipo === 'despesa') linhasFixo.push(linha)
      else linhasVariavel.push(linha)
    })
  }
  empilhar(pagos || [], 'data_pagamento')
  empilhar(abertosFuturos || [], 'data_vencimento')

  ;(recorrenciasAtivas || []).forEach((r: any) => {
    if (recorrenciasJaMaterializadas.has(r.id)) return
    const dataOcorrencia = diaOcorrenciaRecorrencia(ano, mes, r.dia_vencimento)
    if (dataOcorrencia < hoje) return // só projeta hoje/futuro — passado sem lançamento é um gap raro, não um forecast
    linhasFixo.push({
      data: dataOcorrencia,
      valor: r.valor,
      parteId: r.parte_id || 'sem-parte',
      parteNome: r.parte?.nome || 'Sem beneficiário',
      contaId: r.conta_id || 'sem-conta',
      contaNome: r.conta?.nome || 'Sem classificação',
    })
  })

  function agruparLinhasPorDia(linhas: LinhaSaida[]): number[] {
    const porDia = new Map<string, number>()
    linhas.forEach((l) => porDia.set(l.data, (porDia.get(l.data) || 0) + l.valor))
    return dias.map((d) => porDia.get(d) || 0)
  }

  function agruparLinhasPorChave(linhas: LinhaSaida[], chave: 'parteId' | 'contaId', nomeChave: 'parteNome' | 'contaNome'): FluxoMensalLinhaGrupo[] {
    const grupos = new Map<string, FluxoMensalLinhaGrupo>()
    linhas.forEach((l) => {
      const id = l[chave]
      if (!grupos.has(id)) grupos.set(id, { id, nome: l[nomeChave], porDia: dias.map(() => 0), total: 0 })
      const grupo = grupos.get(id)!
      const indiceDia = dias.indexOf(l.data)
      if (indiceDia >= 0) grupo.porDia[indiceDia] += l.valor
      grupo.total += l.valor
    })
    return Array.from(grupos.values()).sort((a, b) => b.total - a.total)
  }

  const saidasFixoPorDia = agruparLinhasPorDia(linhasFixo)
  const saidasFixoPorConta = agruparLinhasPorChave(linhasFixo, 'contaId', 'contaNome')
  const totalSaidasFixo = saidasFixoPorDia.reduce((s, v) => s + v, 0)

  const saidasVariavelPorDia = agruparLinhasPorDia(linhasVariavel)
  const saidasVariavelPorFornecedor = agruparLinhasPorChave(linhasVariavel, 'parteId', 'parteNome')
  const totalSaidasVariavel = saidasVariavelPorDia.reduce((s, v) => s + v, 0)

  // --- Saldo -------------------------------------------------------------------
  const saldoDiaPorDia = dias.map((_, i) => entradasCaixaPorDia[i] - saidasFixoPorDia[i] - saidasVariavelPorDia[i])

  const orcamentosSaldo =
    unidade === 'consolidado'
      ? await Promise.all((['loja1', 'loja2'] as const).map((l) => buscarOrcamento(ano, mes, l)))
      : unidade === 'rateio'
        ? []
        : [await buscarOrcamento(ano, mes, unidade)]
  const saldosIniciais = orcamentosSaldo.map((o) => o?.saldo_inicial).filter((v): v is number => v != null)
  const saldoInicial = saldosIniciais.length > 0 ? saldosIniciais.reduce((s, v) => s + v, 0) : null

  let acumulado = saldoInicial ?? 0
  const saldoAcumuladoPorDia = saldoDiaPorDia.map((saldo) => {
    acumulado += saldo
    return acumulado
  })

  // --- Comparação orçado x realizado (projeção do mês inteiro) -----------------
  const orcamentosDespesa =
    unidade === 'consolidado'
      ? await Promise.all((['loja1', 'loja2', 'rateio'] as const).map((u) => buscarOrcamento(ano, mes, u)))
      : [await buscarOrcamento(ano, mes, unidade)]
  const todosItens = orcamentosDespesa.flatMap((o) => o?.itens || [])

  function compararOrcado(itensPrevisto: typeof todosItens, tipo: TipoLancamento, grupos: FluxoMensalLinhaGrupo[], chave: 'parte_id' | 'conta_id'): FluxoMensalOrcadoRealizado[] {
    const previstoPorId = new Map<string, number>()
    itensPrevisto
      .filter((i) => i.tipo === tipo)
      .forEach((i: any) => {
        const id = i[chave] || 'sem-id'
        previstoPorId.set(id, (previstoPorId.get(id) || 0) + i.valor_previsto)
      })
    const resultado: FluxoMensalOrcadoRealizado[] = []
    const idsVistos = new Set<string>()
    previstoPorId.forEach((previsto, id) => {
      idsVistos.add(id)
      const grupo = grupos.find((g) => g.id === id)
      const projetado = grupo?.total || 0
      resultado.push({ id, nome: grupo?.nome || '—', previsto, projetado, cor: corComparacao(previsto, projetado, 'despesa') })
    })
    return resultado.sort((a, b) => b.previsto - a.previsto)
  }

  const orcadoXRealizadoFixo = compararOrcado(todosItens, 'despesa', saidasFixoPorConta, 'conta_id')
  const orcadoXRealizadoVariavel = compararOrcado(todosItens, 'compra_insumos', saidasVariavelPorFornecedor, 'parte_id')

  return {
    unidade,
    ano,
    mes,
    cenario,
    dias,
    faturamentoAplicavel,
    faturamentoPorDia,
    faturamentoEhForecastPorDia,
    metaMensal,
    metaDiariaPorDia,
    deltaPorDia,
    gapAcumuladoPorDia,
    entradasCaixaPorDia,
    entradasCaixaEhForecastPorDia,
    entradasCaixaPorCategoria,
    totalEntradasCaixa,
    saidasFixoPorDia,
    saidasFixoPorConta,
    totalSaidasFixo,
    saidasVariavelPorDia,
    saidasVariavelPorFornecedor,
    totalSaidasVariavel,
    saldoDiaPorDia,
    saldoInicial,
    saldoAcumuladoPorDia,
    orcadoXRealizadoFixo,
    orcadoXRealizadoVariavel,
  }
}

// --- Atrasados (retrato de hoje, independente do mês navegado) --------------

export interface FluxoMensalAtrasadoItem {
  lancamentoId: string
  parteNome: string
  contaNome: string
  tipo: TipoLancamento
  valor: number
  dataVencimento: string
  diasAtraso: number
}

export interface FluxoMensalAtrasados {
  total: number
  quantidade: number
  itens: FluxoMensalAtrasadoItem[]
}

export async function buscarAtrasados(unidade: VisaoFluxoMensal): Promise<FluxoMensalAtrasados> {
  const hoje = hojeISO()
  const unidades = unidade === 'consolidado' ? ['loja1', 'loja2', 'rateio'] : [unidade]
  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .select('id, valor_total, tipo, data_vencimento, parte:financeiro_partes!parte_id(nome), conta:financeiro_contas(nome)')
    .in('unidade', unidades)
    .eq('status', 'aberto')
    .lt('data_vencimento', hoje)
    .order('data_vencimento')
  if (error) throw new Error(error.message)

  const itens: FluxoMensalAtrasadoItem[] = (data || []).map((l: any) => ({
    lancamentoId: l.id,
    parteNome: l.parte?.nome || 'Sem beneficiário',
    contaNome: l.conta?.nome || 'Sem classificação',
    tipo: l.tipo,
    valor: l.valor_total,
    dataVencimento: l.data_vencimento,
    diasAtraso: Math.round((new Date(hoje + 'T00:00:00').getTime() - new Date(l.data_vencimento + 'T00:00:00').getTime()) / 86400000),
  }))

  return { total: itens.reduce((s, i) => s + i.valor, 0), quantidade: itens.length, itens }
}
