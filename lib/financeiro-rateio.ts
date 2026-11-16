// Regra de rateio do DRE entre as lojas. Funções puras (sem banco) para a regra poder ser testada isolada.
//
// Rateio = custo da cozinha central dividido entre Paraisópolis e Itajubá pela PROPORÇÃO DO FATURAMENTO do mês
// (faturamento fiscal realizado de cada loja sobre o das duas). Vale para tudo lançado na unidade "Rateio (Cozinha)".
//
// Decisão do dono (17/11/2026): as contas de MATÉRIA-PRIMA (1001), EMBALAGEM (1002) e IMPOSTOS DE COMPRA (1004)
// seguem SEMPRE a regra de rateio, qualquer que seja a unidade em que a nota foi lançada — o total de compras do
// mês nessas contas é dividido pela proporção do faturamento. As demais contas continuam na unidade em que foram
// lançadas.

export type VisaoRateio = 'loja1' | 'loja2' | 'consolidado'

/** Contas de CMV rateadas sempre (por código do plano de contas): todas as contas da linha CMV. */
export const CODIGOS_CMV_SEMPRE_RATEADOS: readonly string[] = ['1001', '1002', '1004']

/**
 * Quanto de um lançamento pertence à visão pedida, ou null quando ele não pertence a ela.
 * - consolidado: tudo, por inteiro (a soma das duas lojas fecha com o consolidado);
 * - lançamento da própria loja: por inteiro;
 * - lançamento de rateio: a fatia da loja (valor × percentual);
 * - lançamento da outra loja: não entra.
 * `forcarRateio` trata o lançamento como rateio mesmo vindo de uma loja (contas de CMV sempre rateadas).
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
