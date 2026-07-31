import { supabase } from './supabase'
import { CategoriaReceita, FinanceiroOrcamentoItem, TipoLancamento } from './types'
import { CATEGORIA_RECEITA_LABEL } from './constants'
import { buscarPedidosDoPeriodo, gerarItensVendidosFlat } from './pdv-report'
import { buscarFaturamentoDiarioPeriodo, somaFaturamentoDiario } from './financeiro-faturamento-diario'
import { PontoHistorico, calcularMediaPorDiaSemana, inicioJanelaHistorico } from './financeiro-forecast'
import { hojeISO } from './financeiro-utils'
import { buscarOrcamento } from './financeiro-orcamento'

export type VisaoFluxoMensal = 'loja1' | 'loja2' | 'rateio' | 'consolidado'

export interface FluxoMensalLinhaGrupo {
  id: string
  nome: string
  porDia: number[]
  total: number
  // Presente em saidasPorGrupo (que mistura despesa-por-conta e
  // compra_insumos-por-fornecedor sem outro jeito de diferenciar) —
  // discrimina se `id` é conta_id ou parte_id, usado pro popover de dia
  // saber qual coluna/tipo buscar.
  origem?: 'conta' | 'parte'
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
  dias: string[]

  faturamentoAplicavel: boolean
  faturamentoPorDia: (number | null)[]
  faturamentoEhForecastPorDia: boolean[]
  metaMensal: number | null
  metaDiariaPorDia: (number | null)[]
  deltaPorDia: (number | null)[]
  gapAcumuladoPorDia: (number | null)[]

  entradasCaixaPorDia: (number | null)[]
  entradasCaixaEhForecastPorDia: boolean[]
  entradasCaixaPorCategoria: { categoria: CategoriaReceita; label: string; porDia: (number | null)[]; total: number }[]
  totalEntradasCaixa: number

  saidasPorDia: number[] // já inclui a previsão do orçamento (por dia da semana/data específica) nos dias futuros
  saidasPorGrupo: FluxoMensalLinhaGrupo[] // por conta (despesa) + por fornecedor (compra_insumos), juntos — não há marcador de fixo/variável nos dados; já inclui previsão
  saidasFixoPorConta: FluxoMensalLinhaGrupo[] // já inclui previsão
  saidasVariavelPorFornecedor: FluxoMensalLinhaGrupo[] // já inclui previsão
  totalSaidas: number

  // Versões SEM a previsão do orçamento injetada — só o realizado (pago +
  // já lançado com vencimento futuro + recorrências). Usadas na
  // comparação orçado x realizado (senão compararia o orçamento com ele
  // mesmo) e como base pro wizard recalcular a prévia em cima do rascunho.
  saidasPorDiaRealizado: number[]
  saidasFixoPorContaRealizado: FluxoMensalLinhaGrupo[]
  saidasVariavelPorFornecedorRealizado: FluxoMensalLinhaGrupo[]

  saldoDiaPorDia: (number | null)[]
  saldoInicial: number | null
  saldoAcumuladoPorDia: (number | null)[]

  orcadoXRealizado: FluxoMensalOrcadoRealizado[]
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
export function corComparacao(previsto: number, projetado: number, tipo: 'receita' | 'despesa'): 'azul' | 'laranja' | 'verde' {
  if (previsto === 0) return 'azul'
  const diferenca = (projetado - previsto) / previsto
  const TOLERANCIA = 0.02
  if (Math.abs(diferenca) <= TOLERANCIA) return 'azul'
  if (tipo === 'despesa') return diferenca > 0 ? 'laranja' : 'verde'
  return diferenca > 0 ? 'verde' : 'laranja'
}

/**
 * Valor mensal efetivo de um item de orçamento — se tiver dia_semana
 * marcado, valor_previsto é "por ocorrência" (ex: R$500 toda segunda) e o
 * total do mês é esse valor multiplicado pela quantidade de ocorrências
 * daquele dia no mês. Sem dia_semana, valor_previsto já é o total do mês.
 */
export function valorMensalItemOrcamento(
  item: Pick<FinanceiroOrcamentoItem, 'valor_previsto' | 'dia_semana'>,
  dias: string[]
): number {
  if (item.dia_semana == null) return item.valor_previsto
  const ocorrencias = dias.filter((d) => new Date(d + 'T00:00:00').getDay() === item.dia_semana).length
  return item.valor_previsto * ocorrencias
}

/**
 * Compara itens previstos do orçamento (por tipo) contra o realizado
 * agrupado (por conta ou por fornecedor). Exportada — usada tanto pelo
 * calendário mensal quanto pelo step de Revisão do wizard de orçamento,
 * pra nunca ter duas implementações que podem divergir.
 */
export function compararOrcado(
  itensPrevisto: Pick<FinanceiroOrcamentoItem, 'tipo' | 'parte_id' | 'conta_id' | 'valor_previsto' | 'dia_semana'>[],
  tipo: TipoLancamento,
  grupos: FluxoMensalLinhaGrupo[],
  chave: 'parte_id' | 'conta_id',
  dias: string[]
): FluxoMensalOrcadoRealizado[] {
  const previstoPorId = new Map<string, number>()
  itensPrevisto
    .filter((i) => i.tipo === tipo)
    .forEach((i: any) => {
      const id = i[chave] || 'sem-id'
      previstoPorId.set(id, (previstoPorId.get(id) || 0) + valorMensalItemOrcamento(i, dias))
    })
  const resultado: FluxoMensalOrcadoRealizado[] = []
  previstoPorId.forEach((previsto, id) => {
    const grupo = grupos.find((g) => g.id === id)
    const projetado = grupo?.total || 0
    resultado.push({ id, nome: grupo?.nome || '—', previsto, projetado, cor: corComparacao(previsto, projetado, 'despesa') })
  })
  return resultado.sort((a, b) => b.previsto - a.previsto)
}

/**
 * Datas (dentro de `dias`, sempre futuras — dia > hoje) em que um item de
 * despesa variável do orçamento deveria projetar sua previsão no
 * calendário. "Por dia da semana" gera uma ocorrência por semana restante
 * do mês; "data específica" gera no máximo uma ocorrência. Sem nenhum dos
 * dois, o item não projeta em dia nenhum (só entra na comparação orçado x
 * realizado, como um valor único do mês).
 */
export function ocorrenciasForecastItem(
  item: Pick<FinanceiroOrcamentoItem, 'dia_semana' | 'data_especifica'>,
  dias: string[],
  hoje: string
): string[] {
  if (item.data_especifica) {
    return item.data_especifica > hoje && dias.includes(item.data_especifica) ? [item.data_especifica] : []
  }
  if (item.dia_semana != null) {
    return dias.filter((d) => d > hoje && new Date(d + 'T00:00:00').getDay() === item.dia_semana)
  }
  return []
}

export interface EventoForecastVariavel {
  data: string
  valor: number
  tipo: TipoLancamento
  parteId: string | null
  parteNome: string
  contaId: string | null
  contaNome: string
}

/**
 * Gera os eventos de previsão (por dia da semana ou data específica) dos
 * itens do orçamento pros dias futuros — pulando qualquer ocorrência que
 * já tenha um valor REAL lançado pra mesma conta/fornecedor naquela data
 * exata (evita duplicar quando a nota/boleto já foi lançado de verdade).
 * `gruposFixoRealizado`/`gruposVariavelRealizado` devem vir SEM a própria
 * previsão injetada (real puro) — é contra eles que o "já realizado" é
 * checado. Exportada — usada tanto por buscarFluxoMensal (calendário)
 * quanto pelo wizard de orçamento (prévia ao vivo do rascunho).
 */
export function gerarEventosForecastOrcamento(
  itens: Pick<FinanceiroOrcamentoItem, 'tipo' | 'parte_id' | 'conta_id' | 'valor_previsto' | 'dia_semana' | 'data_especifica'>[],
  gruposFixoRealizado: FluxoMensalLinhaGrupo[],
  gruposVariavelRealizado: FluxoMensalLinhaGrupo[],
  dias: string[],
  hoje: string
): EventoForecastVariavel[] {
  const eventos: EventoForecastVariavel[] = []
  itens.forEach((item: any) => {
    const ehFixo = item.tipo === 'despesa'
    const id = ehFixo ? item.conta_id : item.parte_id
    if (!id) return
    const grupos = ehFixo ? gruposFixoRealizado : gruposVariavelRealizado
    const grupo = grupos.find((g) => g.id === id)
    ocorrenciasForecastItem(item, dias, hoje).forEach((data) => {
      const indice = dias.indexOf(data)
      if (indice < 0) return
      if (grupo && grupo.porDia[indice] > 0) return // já realizado nessa data — não duplica
      eventos.push({
        data,
        valor: item.valor_previsto,
        tipo: item.tipo,
        parteId: ehFixo ? null : id,
        parteNome: ehFixo ? 'Sem beneficiário' : item.parte?.nome || 'Sem beneficiário',
        contaId: ehFixo ? id : null,
        contaNome: ehFixo ? item.conta?.nome || 'Sem classificação' : 'Sem classificação',
      })
    })
  })
  return eventos
}

/** Soma os eventos de forecast por dia — útil pra quem só precisa do total diário (ex: prévia de Saldo Projetado no wizard), sem o detalhamento por conta/fornecedor. */
export function somarEventosPorDia(eventos: EventoForecastVariavel[], dias: string[]): number[] {
  const porDia = new Map<string, number>()
  eventos.forEach((e) => porDia.set(e.data, (porDia.get(e.data) || 0) + e.valor))
  return dias.map((d) => porDia.get(d) || 0)
}

// --- Meta de Venda / Previsão de Entrada cadastradas por dia da semana ------

function somaPorDiaSemana(valoresPorOrcamento: (number | null)[][], dias: string[]): (number | null)[] {
  return dias.map((dia) => {
    const diaSemana = new Date(dia + 'T00:00:00').getDay()
    let soma = 0
    let temAlgum = false
    valoresPorOrcamento.forEach((valores) => {
      const v = valores[diaSemana]
      if (v != null) {
        soma += v
        temAlgum = true
      }
    })
    return temAlgum ? soma : null
  })
}

/**
 * Combina a meta de venda por dia da semana de N lojas num total por dia
 * do mês — soma só as lojas que TÊM valor cadastrado pra aquele dia da
 * semana (loja fechada domingo = null legítimo, não é "zero"). Se nenhuma
 * loja aplicável tiver valor pra aquele dia da semana, o dia fica null
 * (sem meta), nunca 0.
 */
export function metaDiariaDeWeekdays(
  orcamentos: Array<{ metaVendaPorDiaSemana: (number | null)[] } | null>,
  dias: string[]
): (number | null)[] {
  return somaPorDiaSemana(orcamentos.map((o) => o?.metaVendaPorDiaSemana || []), dias)
}

/** Mesma lógica de metaDiariaDeWeekdays, pra previsão de Entradas de Caixa. */
export function entradaPrevistaDeWeekdays(
  orcamentos: Array<{ entradaPrevistaPorDiaSemana: (number | null)[] } | null>,
  dias: string[]
): (number | null)[] {
  return somaPorDiaSemana(orcamentos.map((o) => o?.entradaPrevistaPorDiaSemana || []), dias)
}

/** Delta (Faturamento − Meta Diária) e GAP acumulado (soma corrida do Delta). */
export function calcularDeltaEGap(
  faturamentoPorDia: (number | null)[],
  metaDiariaPorDia: (number | null)[]
): { deltaPorDia: (number | null)[]; gapAcumuladoPorDia: (number | null)[] } {
  const deltaPorDia = faturamentoPorDia.map((f, i) => (f != null && metaDiariaPorDia[i] != null ? f - metaDiariaPorDia[i]! : null))
  let gapCorrente: number | null = 0
  const gapAcumuladoPorDia = deltaPorDia.map((delta) => {
    if (gapCorrente == null || delta == null) {
      gapCorrente = null
    } else {
      gapCorrente = gapCorrente + delta
    }
    return gapCorrente
  })
  return { deltaPorDia, gapAcumuladoPorDia }
}

/** Saldo do dia (Entradas − Saídas) e saldo acumulado (soma corrida a partir do saldo inicial). */
export function calcularSaldoDiarioEAcumulado(
  entradasCaixaPorDia: (number | null)[],
  saidasPorDia: number[],
  saldoInicial: number | null
): { saldoDiaPorDia: (number | null)[]; saldoAcumuladoPorDia: (number | null)[] } {
  const saldoDiaPorDia = entradasCaixaPorDia.map((e, i) => (e != null ? e - saidasPorDia[i] : null))
  let acumulado: number | null = saldoInicial ?? 0
  const saldoAcumuladoPorDia = saldoDiaPorDia.map((saldo) => {
    if (acumulado == null || saldo == null) {
      acumulado = null
    } else {
      acumulado = acumulado + saldo
    }
    return acumulado
  })
  return { saldoDiaPorDia, saldoAcumuladoPorDia }
}

// --- Faturamento (manual > PDV) por loja ------------------------------------

async function buscarFaturamentoLoja(
  loja: 'loja1' | 'loja2',
  ano: number,
  mes: number,
  dias: string[],
  hoje: string
): Promise<{ porDia: (number | null)[]; ehForecastPorDia: boolean[] }> {
  const { inicio, fim } = primeiroEUltimoDia(ano, mes)
  const inicioHistorico = inicioJanelaHistorico(hoje)
  const fimReal = fim < hoje ? fim : hoje

  const [pedidosMes, pedidosHistorico, manualMes, manualHistorico] = await Promise.all([
    inicio <= hoje ? buscarPedidosDoPeriodo(loja, inicio, fimReal) : Promise.resolve([]),
    buscarPedidosDoPeriodo(loja, inicioHistorico, hoje),
    inicio <= hoje ? buscarFaturamentoDiarioPeriodo(loja, inicio, fimReal) : Promise.resolve([]),
    buscarFaturamentoDiarioPeriodo(loja, inicioHistorico, hoje),
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

  const pdvPorDiaReal = agruparPorDia(pedidosMes)
  const pdvHistorico = agruparPorDia(pedidosHistorico)

  // Lançamento manual (informado pelo próprio lojista, mais atual que o PDV,
  // que é importado em lote/atrasado) sempre vence o PDV no dia em que os
  // dois existirem — tanto no valor realizado quanto na média histórica do
  // forecast. A linha manual existir já conta como "dia fechado" mesmo com
  // soma 0 (loja fechada num feriado), por isso usa o Map (presença), nunca
  // um teste de "soma > 0".
  const manualPorDiaReal = new Map(manualMes.map((r) => [r.data, somaFaturamentoDiario(r)]))
  const manualPorDiaHistorico = new Map(manualHistorico.map((r) => [r.data, somaFaturamentoDiario(r)]))

  const datasHistorico = new Set([...pdvHistorico.keys(), ...manualPorDiaHistorico.keys()])
  const pontosHistoricos: PontoHistorico[] = Array.from(datasHistorico).map((data) => ({
    data,
    valor: manualPorDiaHistorico.has(data) ? manualPorDiaHistorico.get(data)! : pdvHistorico.get(data)!,
  }))

  const mediaPorDiaSemana = calcularMediaPorDiaSemana(pontosHistoricos)

  const porDia: (number | null)[] = []
  const ehForecastPorDia: boolean[] = []
  dias.forEach((dia) => {
    if (dia <= hoje) {
      porDia.push(manualPorDiaReal.has(dia) ? manualPorDiaReal.get(dia)! : (pdvPorDiaReal.get(dia) ?? 0))
      ehForecastPorDia.push(false)
    } else {
      porDia.push(mediaPorDiaSemana[new Date(dia + 'T00:00:00').getDay()])
      ehForecastPorDia.push(true)
    }
  })

  return { porDia, ehForecastPorDia }
}

export interface FaturamentoPorLoja {
  loja: 'loja1' | 'loja2'
  porDia: (number | null)[]
  ehForecastPorDia: boolean[]
}

/**
 * Breakdown por loja do Faturamento do mês — buscarFluxoMensal já calcula
 * isso internamente (via buscarFaturamentoLoja, uma vez por loja) mas soma
 * antes de retornar (view é sempre 'consolidado'). Usado só pelo popover
 * de navegação da linha Faturamento (clique num dia ou no Total do mês),
 * sob demanda — reaproveita a mesma lógica de merge manual×PDV e
 * forecast, sem duplicar.
 */
export async function buscarFaturamentoPorLojaDoMes(ano: number, mes: number): Promise<FaturamentoPorLoja[]> {
  const dias = diasDoMes(ano, mes)
  const hoje = hojeISO()
  const lojas: ('loja1' | 'loja2')[] = ['loja1', 'loja2']
  const resultados = await Promise.all(lojas.map((loja) => buscarFaturamentoLoja(loja, ano, mes, dias, hoje)))
  return lojas.map((loja, i) => ({ loja, porDia: resultados[i].porDia, ehForecastPorDia: resultados[i].ehForecastPorDia }))
}

// --- Despesas fixas futuras (já lançadas + recorrências ainda não materializadas) --

export interface LinhaDespesaFixaFutura {
  data: string
  valor: number
  parteId: string
  parteNome: string
  contaId: string
  contaNome: string
  origem: 'lancamento' | 'recorrencia'
}

/**
 * Despesas fixas (tipo='despesa') já conhecidas pro resto do mês — o que
 * já está lançado com vencimento futuro + o que ainda vai ser gerado
 * pelas recorrências ativas (projetado por existência de lançamento no
 * mês, nunca por proxima_data — proxima_data só aponta uma ocorrência à
 * frente). Exportada — usada pelo cálculo de Saídas do calendário E pelo
 * step "Despesas Fixas" (somente leitura) do wizard de orçamento, pra não
 * duplicar essa lógica em dois lugares.
 */
export async function buscarDespesasFixasFuturas(
  unidade: VisaoFluxoMensal,
  ano: number,
  mes: number
): Promise<{ itens: LinhaDespesaFixaFutura[]; total: number }> {
  const { inicio, fim } = primeiroEUltimoDia(ano, mes)
  const hoje = hojeISO()
  const unidadesDespesa = unidade === 'consolidado' ? ['loja1', 'loja2', 'rateio'] : [unidade]

  const [{ data: abertosFuturos, error: erroAbertos }, { data: recorrenciasAtivas, error: erroRecorrencias }] = await Promise.all([
    supabase
      .from('financeiro_lancamentos')
      .select('valor_total, parte_id, parte:financeiro_partes!parte_id(nome), conta_id, conta:financeiro_contas(nome), data_vencimento')
      .in('unidade', unidadesDespesa)
      .eq('status', 'aberto')
      .eq('tipo', 'despesa')
      .gte('data_vencimento', hoje)
      .lte('data_vencimento', fim),
    supabase
      .from('financeiro_recorrencias')
      .select('id, valor, dia_vencimento, parte_id, parte:financeiro_partes(nome), conta_id, conta:financeiro_contas(nome)')
      .in('unidade', unidadesDespesa)
      .eq('ativa', true),
  ])
  if (erroAbertos) throw new Error(erroAbertos.message)
  if (erroRecorrencias) throw new Error(erroRecorrencias.message)

  const idsRecorrenciasAtivas = (recorrenciasAtivas || []).map((r: any) => r.id)
  let recorrenciasJaMaterializadas = new Set<string>()
  if (idsRecorrenciasAtivas.length > 0) {
    const { data: jaLancadas, error: erroJaLancadas } = await supabase
      .from('financeiro_lancamentos')
      .select('recorrencia_id')
      .in('recorrencia_id', idsRecorrenciasAtivas)
      .neq('status', 'cancelado') // um lançamento cancelado não conta como "já gerado" — senão a projeção some por engano
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim)
    if (erroJaLancadas) throw new Error(erroJaLancadas.message)
    recorrenciasJaMaterializadas = new Set((jaLancadas || []).map((l: any) => l.recorrencia_id))
  }

  const itens: LinhaDespesaFixaFutura[] = (abertosFuturos || []).map((l: any) => ({
    data: l.data_vencimento,
    valor: l.valor_total,
    parteId: l.parte_id || 'sem-parte',
    parteNome: l.parte?.nome || 'Sem beneficiário',
    contaId: l.conta_id || 'sem-conta',
    contaNome: l.conta?.nome || 'Sem classificação',
    origem: 'lancamento',
  }))

  ;(recorrenciasAtivas || []).forEach((r: any) => {
    if (recorrenciasJaMaterializadas.has(r.id)) return
    const dataOcorrencia = diaOcorrenciaRecorrencia(ano, mes, r.dia_vencimento)
    if (dataOcorrencia < hoje) return // só projeta hoje/futuro — passado sem lançamento é um gap raro, não um forecast
    itens.push({
      data: dataOcorrencia,
      valor: r.valor,
      parteId: r.parte_id || 'sem-parte',
      parteNome: r.parte?.nome || 'Sem beneficiário',
      contaId: r.conta_id || 'sem-conta',
      contaNome: r.conta?.nome || 'Sem classificação',
      origem: 'recorrencia',
    })
  })

  itens.sort((a, b) => a.data.localeCompare(b.data))
  return { itens, total: itens.reduce((s, i) => s + i.valor, 0) }
}

// --- lançamentos individuais de um dia, pro popover de Saídas -----------------

export interface LancamentoDoDiaSaida {
  id: string
  descricao: string
  valor_total: number
  status: 'aberto' | 'pago'
  numero_documento: string | null
  parte_nome: string
}

/**
 * Lançamentos individuais reais de UM grupo (conta ou fornecedor) em UM
 * dia específico — busca sob demanda pro popover de dia, direto em
 * financeiro_lancamentos (não reaproveita linhasFixo/linhasVariavel de
 * buscarFluxoMensal, que misturam pago+aberto+recorrência-ainda-não-
 * materializada+previsão-de-orçamento sem id real). Se vier vazio mas a
 * célula clicada mostra valor, é 100% previsão (recorrência ou orçamento)
 * sem lançamento real ainda — quem chama trata esse caso.
 */
export async function buscarLancamentosDoDiaSaida(
  unidade: VisaoFluxoMensal,
  dia: string,
  origem: 'conta' | 'parte',
  grupoId: string
): Promise<LancamentoDoDiaSaida[]> {
  const unidadesDespesa = unidade === 'consolidado' ? ['loja1', 'loja2', 'rateio'] : [unidade]
  const tipo: TipoLancamento = origem === 'conta' ? 'despesa' : 'compra_insumos'
  const coluna = origem === 'conta' ? 'conta_id' : 'parte_id'

  function baseQuery() {
    return supabase
      .from('financeiro_lancamentos')
      .select('id, descricao, valor_total, status, numero_documento, parte:financeiro_partes!parte_id(nome)')
      .in('unidade', unidadesDespesa)
      .eq('tipo', tipo)
      .eq(coluna, grupoId)
  }

  const [{ data: pagos, error: erroPagos }, { data: abertos, error: erroAbertos }] = await Promise.all([
    baseQuery().eq('status', 'pago').eq('data_pagamento', dia),
    baseQuery().eq('status', 'aberto').eq('data_vencimento', dia),
  ])
  if (erroPagos) throw new Error(erroPagos.message)
  if (erroAbertos) throw new Error(erroAbertos.message)

  return [...(pagos || []), ...(abertos || [])].map((l: any) => ({
    id: l.id,
    descricao: l.descricao,
    valor_total: l.valor_total,
    status: l.status,
    numero_documento: l.numero_documento,
    parte_nome: l.parte?.nome || 'Sem beneficiário',
  }))
}

// --- função principal --------------------------------------------------------

/**
 * Visão mensal do Fluxo de Caixa: Faturamento (PDV) x Meta de Venda,
 * Entradas de Caixa (financeiro_receitas), Saídas (financeiro_lancamentos),
 * saldo diário/acumulado e a comparação orçado x realizado do mês. Meta de
 * Venda e previsão de Entradas de Caixa são cadastradas à mão por dia da
 * semana no orçamento (ver lib/financeiro-orcamento.ts) — só o Faturamento
 * continua com forecast por média histórica (PDV).
 */
export async function buscarFluxoMensal(unidade: VisaoFluxoMensal, ano: number, mes: number): Promise<FluxoMensalResultado> {
  const dias = diasDoMes(ano, mes)
  const { inicio, fim } = primeiroEUltimoDia(ano, mes)
  const hoje = hojeISO()

  const lojasAplicaveis: ('loja1' | 'loja2')[] =
    unidade === 'consolidado' ? ['loja1', 'loja2'] : unidade === 'rateio' ? [] : [unidade as 'loja1' | 'loja2']
  const orcamentosLojas = await Promise.all(lojasAplicaveis.map((l) => buscarOrcamento(ano, mes, l)))

  // --- Faturamento / Meta / Delta / GAP -------------------------------------
  const faturamentoAplicavel = unidade !== 'rateio'
  let faturamentoPorDia: (number | null)[] = dias.map(() => null)
  let faturamentoEhForecastPorDia: boolean[] = dias.map(() => false)
  let metaMensal: number | null = null
  let metaDiariaPorDia: (number | null)[] = dias.map(() => null)

  if (faturamentoAplicavel) {
    const resultadosPorLoja = await Promise.all(lojasAplicaveis.map((l) => buscarFaturamentoLoja(l, ano, mes, dias, hoje)))

    faturamentoPorDia = dias.map((_, i) => {
      const valores = resultadosPorLoja.map((r) => r.porDia[i])
      if (valores.some((v) => v == null)) return null
      return valores.reduce((s: number, v) => s + (v as number), 0)
    })
    faturamentoEhForecastPorDia = dias.map((_, i) => resultadosPorLoja.some((r) => r.ehForecastPorDia[i]))

    metaDiariaPorDia = metaDiariaDeWeekdays(orcamentosLojas, dias)
    metaMensal = metaDiariaPorDia.some((v) => v != null) ? metaDiariaPorDia.reduce((s: number, v) => s + (v || 0), 0) : null
  }

  const { deltaPorDia, gapAcumuladoPorDia } = calcularDeltaEGap(faturamentoPorDia, metaDiariaPorDia)

  // --- Entradas de Caixa -----------------------------------------------------
  let receitasReais: any[] = []
  if (lojasAplicaveis.length > 0) {
    const { data: reais, error: erroReais } = await supabase
      .from('financeiro_receitas')
      .select('unidade, categoria, data, valor')
      .in('unidade', lojasAplicaveis)
      .gte('data', inicio)
      .lte('data', fim)
    if (erroReais) throw new Error(erroReais.message)
    receitasReais = reais || []
  }

  const realEntradasPorDia = new Map<string, number>()
  receitasReais.forEach((r) => realEntradasPorDia.set(r.data, (realEntradasPorDia.get(r.data) || 0) + r.valor))

  const entradaPrevistaPorDia = entradaPrevistaDeWeekdays(orcamentosLojas, dias)
  const entradasCaixaPorDia: (number | null)[] = []
  const entradasCaixaEhForecastPorDia: boolean[] = []
  dias.forEach((dia, i) => {
    if (dia <= hoje || lojasAplicaveis.length === 0) {
      entradasCaixaPorDia.push(realEntradasPorDia.get(dia) || 0)
      entradasCaixaEhForecastPorDia.push(false)
    } else {
      entradasCaixaPorDia.push(entradaPrevistaPorDia[i])
      entradasCaixaEhForecastPorDia.push(true)
    }
  })

  // Detalhe por categoria, dia a dia — só realizado (regime de caixa não
  // tem forecast por categoria, só o total agregado); dias futuros ficam
  // null (não é "zero", é "não projetado nesse nível de detalhe").
  const porCategoriaEDia = new Map<CategoriaReceita, (number | null)[]>()
  Object.keys(CATEGORIA_RECEITA_LABEL).forEach((c) =>
    porCategoriaEDia.set(c as CategoriaReceita, dias.map((d) => (d <= hoje ? 0 : null)))
  )
  receitasReais.forEach((r) => {
    if (r.data > hoje) return
    const porDia = porCategoriaEDia.get(r.categoria)
    if (!porDia) return
    const indice = dias.indexOf(r.data)
    if (indice >= 0) porDia[indice] = (porDia[indice] || 0) + r.valor
  })
  const entradasCaixaPorCategoria = Array.from(porCategoriaEDia.entries()).map(([categoria, porDia]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    porDia,
    total: porDia.reduce((s: number, v) => s + (v || 0), 0),
  }))
  const totalEntradasCaixa = entradasCaixaPorDia.reduce((s: number, v) => s + (v || 0), 0)

  // --- Saídas (fixas + variáveis) --------------------------------------------
  const unidadesDespesa = unidade === 'consolidado' ? ['loja1', 'loja2', 'rateio'] : [unidade]

  // Despesas orçadas são sempre consolidadas — um balde só ('geral'), sem
  // distinção de loja/rateio (a empresa tratada como uma unidade só).
  const [{ data: pagos, error: erroPagos }, { data: abertosVariavelFuturos, error: erroAbertos }, despesasFixasFuturas, orcamentoGeral] =
    await Promise.all([
      supabase
        .from('financeiro_lancamentos')
        .select('valor_total, tipo, parte_id, parte:financeiro_partes!parte_id(nome), conta_id, conta:financeiro_contas(nome), data_pagamento')
        .in('unidade', unidadesDespesa)
        .eq('status', 'pago')
        .gte('data_pagamento', inicio)
        .lte('data_pagamento', fim),
      supabase
        .from('financeiro_lancamentos')
        .select('valor_total, parte_id, parte:financeiro_partes!parte_id(nome), conta_id, conta:financeiro_contas(nome), data_vencimento')
        .in('unidade', unidadesDespesa)
        .eq('status', 'aberto')
        .eq('tipo', 'compra_insumos')
        .gte('data_vencimento', hoje)
        .lte('data_vencimento', fim),
      buscarDespesasFixasFuturas(unidade, ano, mes),
      buscarOrcamento(ano, mes, 'geral'),
    ])
  if (erroPagos) throw new Error(erroPagos.message)
  if (erroAbertos) throw new Error(erroAbertos.message)
  const todosItens = orcamentoGeral?.itens || []

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

  ;(pagos || []).forEach((l: any) => {
    const linha: LinhaSaida = {
      data: l.data_pagamento,
      valor: l.valor_total,
      parteId: l.parte_id || 'sem-parte',
      parteNome: l.parte?.nome || 'Sem beneficiário',
      contaId: l.conta_id || 'sem-conta',
      contaNome: l.conta?.nome || 'Sem classificação',
    }
    if (l.tipo === 'despesa') linhasFixo.push(linha)
    else linhasVariavel.push(linha)
  })

  ;(abertosVariavelFuturos || []).forEach((l: any) => {
    linhasVariavel.push({
      data: l.data_vencimento,
      valor: l.valor_total,
      parteId: l.parte_id || 'sem-parte',
      parteNome: l.parte?.nome || 'Sem beneficiário',
      contaId: l.conta_id || 'sem-conta',
      contaNome: l.conta?.nome || 'Sem classificação',
    })
  })

  despesasFixasFuturas.itens.forEach((i) => {
    linhasFixo.push({ data: i.data, valor: i.valor, parteId: i.parteId, parteNome: i.parteNome, contaId: i.contaId, contaNome: i.contaNome })
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

  // Agregações do REALIZADO puro (pago + já lançado com vencimento futuro
  // + recorrências) — antes de injetar a previsão do orçamento. Servem de
  // base pro "já realizado" (evita duplicar) e pra comparação orçado x
  // realizado (que não pode incluir a própria previsão, senão vira
  // tautologia).
  const saidasFixoPorContaRealizado = agruparLinhasPorChave(linhasFixo, 'contaId', 'contaNome')
  const saidasVariavelPorFornecedorRealizado = agruparLinhasPorChave(linhasVariavel, 'parteId', 'parteNome')
  const saidasFixoPorDiaRealizado = agruparLinhasPorDia(linhasFixo)
  const saidasVariavelPorDiaRealizado = agruparLinhasPorDia(linhasVariavel)
  const saidasPorDiaRealizado = dias.map((_, i) => saidasFixoPorDiaRealizado[i] + saidasVariavelPorDiaRealizado[i])

  // Injeta a previsão do orçamento (por dia da semana ou data específica)
  // nos dias futuros — some sozinha se o dia já passou (dia <= hoje nunca
  // recebe previsão, só real) ou se já existe um lançamento real na mesma
  // conta/fornecedor naquela data exata (checado contra o Realizado acima).
  const eventosForecast = gerarEventosForecastOrcamento(todosItens, saidasFixoPorContaRealizado, saidasVariavelPorFornecedorRealizado, dias, hoje)
  eventosForecast.forEach((ev) => {
    const linha: LinhaSaida = {
      data: ev.data,
      valor: ev.valor,
      parteId: ev.parteId || 'sem-parte',
      parteNome: ev.parteNome,
      contaId: ev.contaId || 'sem-conta',
      contaNome: ev.contaNome,
    }
    if (ev.tipo === 'despesa') linhasFixo.push(linha)
    else linhasVariavel.push(linha)
  })

  // Com a previsão já injetada — usado no calendário (totais e detalhamento).
  const saidasFixoPorDia = agruparLinhasPorDia(linhasFixo)
  const saidasFixoPorConta = agruparLinhasPorChave(linhasFixo, 'contaId', 'contaNome').map((g) => ({ ...g, origem: 'conta' as const }))
  const saidasVariavelPorDia = agruparLinhasPorDia(linhasVariavel)
  const saidasVariavelPorFornecedor = agruparLinhasPorChave(linhasVariavel, 'parteId', 'parteNome').map((g) => ({ ...g, origem: 'parte' as const }))

  // Uma linha só de Saídas — despesa (por conta) e compra_insumos (por
  // fornecedor) não representam fixo x variável de verdade, então não
  // fazem sentido como duas seções separadas na tela.
  const saidasPorDia = dias.map((_, i) => saidasFixoPorDia[i] + saidasVariavelPorDia[i])
  const saidasPorGrupo = [...saidasFixoPorConta, ...saidasVariavelPorFornecedor].sort((a, b) => b.total - a.total)
  const totalSaidas = saidasPorDia.reduce((s, v) => s + v, 0)

  // --- Saldo -------------------------------------------------------------------
  const saldosIniciais = orcamentosLojas.map((o) => o?.saldo_inicial).filter((v): v is number => v != null)
  const saldoInicial = saldosIniciais.length > 0 ? saldosIniciais.reduce((s, v) => s + v, 0) : null

  const { saldoDiaPorDia, saldoAcumuladoPorDia } = calcularSaldoDiarioEAcumulado(entradasCaixaPorDia, saidasPorDia, saldoInicial)

  // --- Comparação orçado x realizado (projeção do mês inteiro) -----------------
  // Usa as agregações REALIZADO (sem a previsão injetada) — comparar o
  // orçamento contra um número que já inclui a própria previsão seria
  // comparar o orçamento com ele mesmo.
  const orcadoXRealizado = [
    ...compararOrcado(todosItens, 'despesa', saidasFixoPorContaRealizado, 'conta_id', dias),
    ...compararOrcado(todosItens, 'compra_insumos', saidasVariavelPorFornecedorRealizado, 'parte_id', dias),
  ].sort((a, b) => b.previsto - a.previsto)

  return {
    unidade,
    ano,
    mes,
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
    saidasPorDia,
    saidasPorGrupo,
    saidasFixoPorConta,
    saidasVariavelPorFornecedor,
    totalSaidas,
    saidasPorDiaRealizado,
    saidasFixoPorContaRealizado,
    saidasVariavelPorFornecedorRealizado,
    saldoDiaPorDia,
    saldoInicial,
    saldoAcumuladoPorDia,
    orcadoXRealizado,
  }
}

/**
 * Saldo acumulado no último dia de um mês, pras duas lojas — usado como
 * SUGESTÃO (nunca preenchimento automático) de saldo inicial do mês
 * seguinte no wizard de Orçamento. buscarFluxoMensal('loja1'|'loja2', ...)
 * sozinho NÃO inclui as saídas de 'rateio' (cozinha, sem conta própria —
 * o gasto sai do caixa das lojas), então o saldo de cada loja isolada fica
 * inflado; aqui a fatia de rateio do mês é rateada entre as duas na
 * proporção do faturamento de cada uma, pra soma das duas sugestões bater
 * com o saldo acumulado real do Fluxo de Caixa consolidado.
 */
export async function buscarSaldosFinaisDoMes(ano: number, mes: number): Promise<{ loja1: number | null; loja2: number | null }> {
  const [dadosLoja1, dadosLoja2, dadosRateio] = await Promise.all([
    buscarFluxoMensal('loja1', ano, mes),
    buscarFluxoMensal('loja2', ano, mes),
    buscarFluxoMensal('rateio', ano, mes),
  ])

  const faturamentoLoja1 = dadosLoja1.faturamentoPorDia.reduce((s: number, v) => s + (v || 0), 0)
  const faturamentoLoja2 = dadosLoja2.faturamentoPorDia.reduce((s: number, v) => s + (v || 0), 0)
  const faturamentoTotal = faturamentoLoja1 + faturamentoLoja2
  const proporcaoLoja1 = faturamentoTotal > 0 ? faturamentoLoja1 / faturamentoTotal : 0.5
  const proporcaoLoja2 = faturamentoTotal > 0 ? faturamentoLoja2 / faturamentoTotal : 0.5

  const ultimoDia = (arr: (number | null)[]) => (arr.length > 0 ? arr[arr.length - 1] : null)
  const saldoLoja1 = ultimoDia(dadosLoja1.saldoAcumuladoPorDia)
  const saldoLoja2 = ultimoDia(dadosLoja2.saldoAcumuladoPorDia)

  return {
    loja1: saldoLoja1 != null ? saldoLoja1 - dadosRateio.totalSaidas * proporcaoLoja1 : null,
    loja2: saldoLoja2 != null ? saldoLoja2 - dadosRateio.totalSaidas * proporcaoLoja2 : null,
  }
}

export interface ResumoHubFinanceiro {
  saldoAtual: number | null // saldo acumulado de hoje; null = sem saldo inicial informado
  faturamentoRealizado: number // soma do faturamento já realizado (não-forecast) do mês até hoje
  metaAteHoje: number // soma da meta diária dos mesmos dias (comparável com faturamentoRealizado)
}

/**
 * Resumo pro card "Fluxo de Caixa" do hub — reaproveita buscarFluxoMensal
 * (consolidado, mês corrente) em vez de duplicar a lógica de faturamento
 * x meta x saldo num cálculo paralelo; só extrai os 3 números que cabem
 * num card pequeno.
 */
export async function buscarResumoHubFinanceiro(): Promise<ResumoHubFinanceiro> {
  const hoje = hojeISO()
  const [ano, mes] = hoje.split('-').map(Number)
  const dados = await buscarFluxoMensal('consolidado', ano, mes)

  // dados.saldoInicial (bruto) é o único jeito de saber se foi informado —
  // saldoAcumuladoPorDia trata ausência como 0 internamente (soma corrida),
  // então nunca vem null só por falta de saldo inicial.
  const indiceHoje = dados.dias.indexOf(hoje)
  const saldoAtual = dados.saldoInicial == null ? null : indiceHoje >= 0 ? dados.saldoAcumuladoPorDia[indiceHoje] : null

  let faturamentoRealizado = 0
  let metaAteHoje = 0
  dados.dias.forEach((d, i) => {
    if (dados.faturamentoEhForecastPorDia[i]) return
    faturamentoRealizado += dados.faturamentoPorDia[i] || 0
    metaAteHoje += dados.metaDiariaPorDia[i] || 0
  })

  return { saldoAtual, faturamentoRealizado, metaAteHoje }
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
