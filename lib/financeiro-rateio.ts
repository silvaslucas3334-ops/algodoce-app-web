// Regra de rateio do DRE entre as lojas. Funções puras (sem banco) para a regra poder ser testada isolada.
//
// Rateio = custo da cozinha central dividido entre Paraisópolis e Itajubá pela PROPORÇÃO DO FATURAMENTO do mês
// (faturamento fiscal realizado de cada loja sobre o das duas). Vale para tudo lançado na unidade "Rateio (Cozinha)".
//
// Contas CENTRAIS (financeiro_contas.rateio_sempre = true, marcadas no Plano de Contas — decisão do dono em
// 17/11/2026) seguem SEMPRE a regra de rateio, qualquer que seja a unidade em que o lançamento foi feito: o total
// do mês nessas contas é dividido pela proporção do faturamento. As demais contas ficam na unidade lançada.

export type VisaoRateio = 'loja1' | 'loja2' | 'consolidado'

/**
 * Contas centrais de antes da coluna `rateio_sempre` existir no banco (matéria-prima, embalagem e impostos de
 * compra). Só vale como rede de segurança se o front for publicado antes do SQL: com a coluna, manda a coluna.
 */
export const CODIGOS_CENTRAIS_LEGADO: readonly string[] = ['1001', '1002', '1004']

export interface ContaParaRateio {
  id: string
  codigo: string
  rateio_sempre?: boolean | null
}

/** IDs das contas centrais. Se a coluna ainda não existe (campo ausente em todas as contas), usa a lista legada. */
export function idsContasCentrais(contas: ContaParaRateio[]): Set<string> {
  const temColuna = contas.some((c) => c.rateio_sempre !== undefined && c.rateio_sempre !== null)
  return new Set(
    contas.filter((c) => (temColuna ? c.rateio_sempre === true : CODIGOS_CENTRAIS_LEGADO.includes(c.codigo))).map((c) => c.id)
  )
}

/**
 * Quanto de um lançamento pertence à visão pedida, ou null quando ele não pertence a ela.
 * - consolidado: tudo, por inteiro (a soma das duas lojas fecha com o consolidado);
 * - lançamento da própria loja: por inteiro;
 * - lançamento de rateio: a fatia da loja (valor × percentual);
 * - lançamento da outra loja: não entra.
 * `forcarRateio` trata o lançamento como rateio mesmo vindo de uma loja (conta central).
 */
export function parcelaNaVisao(
  valor: number,
  unidadeDoLancamento: string,
  visao: VisaoRateio,
  percentualRateio: number | null,
  forcarRateio = false
): number | null {
  const unidade = forcarRateio ? 'rateio' : unidadeDoLancamento
  if (visao === 'consolidado' || unidade === visao) return valor
  if (unidade === 'rateio') return valor * (percentualRateio || 0)
  return null
}
