// Estatística compartilhada do forecast de tendência do Faturamento (PDV)
// na visão mensal do Fluxo de Caixa — Meta de Venda e previsão de Entradas
// de Caixa são cadastradas à mão (ver lib/financeiro-orcamento.ts), só o
// Faturamento futuro continua estimado por média histórica.

export const JANELA_HISTORICO_DIAS = 90 // trailing window pra média

export interface PontoHistorico {
  data: string // AAAA-MM-DD
  valor: number
}

function diaDaSemana(dataISO: string): number {
  return new Date(dataISO + 'T00:00:00').getDay() // 0=domingo..6=sábado
}

/**
 * Média absoluta (R$) de cada dia da semana — usa pro forecast de
 * tendência do Faturamento. Dia da semana sem nenhum ponto histórico
 * retorna null (nunca 0) — é previsão, pode ficar incompleta.
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
