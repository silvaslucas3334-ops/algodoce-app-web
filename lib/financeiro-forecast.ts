// Estatística compartilhada do forecast da visão mensal do Fluxo de Caixa —
// usada tanto pro Faturamento (PDV) quanto pras Entradas de Caixa
// (financeiro_receitas), cada uma com sua própria série histórica mas o
// mesmo cálculo por trás.

export const JANELA_HISTORICO_DIAS = 90 // trailing window pras médias/participações

export const CENARIO_MULTIPLICADOR = { pessimista: 0.85, moderado: 1, otimista: 1.15 } as const
export type Cenario = keyof typeof CENARIO_MULTIPLICADOR

export interface PontoHistorico {
  data: string // AAAA-MM-DD
  valor: number
}

function diaDaSemana(dataISO: string): number {
  return new Date(dataISO + 'T00:00:00').getDay() // 0=domingo..6=sábado
}

/**
 * Participação de cada dia da semana no total do histórico — soma 1.
 * Usa pra distribuir um total CONHECIDO (a meta de venda) proporcionalmente
 * ao padrão de cada dia, sem depender de quantas segundas/sextas etc. o mês
 * alvo tem (normalização fica em distribuirValorPorDiaSemana).
 *
 * Dia da semana sem nenhum histórico cai no fallback de divisão igual
 * entre os dias que TÊM dado — a meta precisa fechar 100%, nunca pode
 * ficar com buraco (diferente da tendência de faturamento, que pode
 * mostrar "sem histórico").
 */
export function calcularParticipacaoPorDiaSemana(pontos: PontoHistorico[]): number[] {
  const somaPorDia = new Array(7).fill(0)
  const temDadoPorDia = new Array(7).fill(false)
  pontos.forEach((p) => {
    const dia = diaDaSemana(p.data)
    somaPorDia[dia] += p.valor
    if (p.valor > 0) temDadoPorDia[dia] = true
  })

  const total = somaPorDia.reduce((s, v) => s + v, 0)
  if (total <= 0) return new Array(7).fill(1 / 7)

  const diasComDado = temDadoPorDia.filter(Boolean).length
  if (diasComDado === 0) return new Array(7).fill(1 / 7)

  return somaPorDia.map((soma, dia) => (temDadoPorDia[dia] ? soma / total : 0))
}

/**
 * Distribui um valor total (a meta) pelos dias de um mês específico,
 * respeitando a participação de cada dia da semana — normalizado pra
 * sempre somar exatamente valorTotal, não importa quantas segundas/sextas
 * etc. aquele mês tenha (meses não têm semanas inteiras).
 */
export function distribuirValorPorDiaSemana(valorTotal: number, participacao: number[], dias: string[]): number[] {
  const pesos = dias.map((d) => participacao[diaDaSemana(d)])
  const pesoTotal = pesos.reduce((s, p) => s + p, 0)
  if (pesoTotal <= 0) return dias.map(() => valorTotal / dias.length)
  return pesos.map((peso) => (valorTotal * peso) / pesoTotal)
}

/**
 * Média absoluta (R$) de cada dia da semana — usa pro forecast de
 * tendência (Faturamento e Entradas de Caixa), independente de qualquer
 * meta. Dia da semana sem nenhum ponto histórico retorna null (nunca 0)
 * — é previsão, pode ficar incompleta; diferente da participação acima,
 * que precisa sempre fechar 100% da meta.
 */
export function calcularMediaPorDiaSemana(pontos: PontoHistorico[]): (number | null)[] {
  const somaPorDia = new Array(7).fill(0)
  const contagemPorDia = new Array(7).fill(0)
  pontos.forEach((p) => {
    const dia = diaDaSemana(p.data)
    somaPorDia[dia] += p.valor
    contagemPorDia[dia] += 1
  })
  return somaPorDia.map((soma, dia) => (contagemPorDia[dia] > 0 ? soma / contagemPorDia[dia] : null))
}

/** Data de início da janela histórica (JANELA_HISTORICO_DIAS antes de hoje). */
export function inicioJanelaHistorico(hojeISO: string): string {
  const [ano, mes, dia] = hojeISO.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia - JANELA_HISTORICO_DIAS)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
