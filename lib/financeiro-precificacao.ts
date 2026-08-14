import { supabase } from './supabase'
import { FinanceiroConfigPrecificacao } from './types'
import { hojeISO, somarDias } from './financeiro-utils'

// --- markup: custo -> preço ideal --------------------------------------

/**
 * Índice de markup multiplicador — Preço = Custo × índice. DF/DV/ML são
 * sempre % do PREÇO DE VENDA, nunca do custo (é o erro mais comum ao
 * montar essas fórmulas). null quando a soma bate ou passa de 100%: o
 * preço resultante viraria negativo/infinito, então trava em vez de
 * mostrar um número absurdo.
 */
export function calcularIndiceMarkup(dfPct: number, dvPct: number, mlPct: number): number | null {
  const soma = dfPct + dvPct + mlPct
  if (soma >= 100) return null
  return 100 / (100 - soma)
}

export function calcularPrecoSugerido(custo: number, indiceMarkup: number): number {
  return custo * indiceMarkup
}

// --- margem de contribuição: custo + preço praticado -> quanto sobra -----

export interface MargemContribuicao {
  valorRS: number
  percentual: number // sobre o preço de venda, não sobre o custo
}

/**
 * MC = Preço − (Custo + despesas variáveis do preço). Espelha o inverso
 * do markup: markup parte do custo pra definir o preço; isso aqui parte
 * de um preço (praticado ou sugerido) pra avaliar quanto sobra.
 */
export function calcularMargemContribuicao(precoVenda: number, custo: number, dvPct: number): MargemContribuicao {
  const custoVariavelTotal = custo + (dvPct / 100) * precoVenda
  const valorRS = precoVenda - custoVariavelTotal
  const percentual = precoVenda > 0 ? (valorRS / precoVenda) * 100 : 0
  return { valorRS, percentual }
}

// --- config global (linha única) ----------------------------------------

export async function buscarConfigPrecificacao(): Promise<FinanceiroConfigPrecificacao> {
  const { data, error } = await supabase.from('financeiro_config_precificacao').select('*').limit(1).single()
  if (error) throw new Error(error.message)
  return data
}

export async function salvarConfigPrecificacao(
  id: string,
  dados: Pick<
    FinanceiroConfigPrecificacao,
    'taxa_cartao_pct' | 'comissao_marketplace_pct' | 'imposto_venda_pct' | 'custos_fixos_pct' | 'margem_lucro_padrao_pct'
  >
): Promise<void> {
  const { error } = await supabase
    .from('financeiro_config_precificacao')
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// --- sugestão de despesas variáveis, a partir do histórico real ---------

export interface SugestaoDespesasVariaveis {
  taxaCartaoPct: number | null // null = sem venda no cartão registrada no período
  taxaMarketplacePct: number | null // null = sem repasse iFood/Aiqfome no período
  diasConsiderados: number
}

/**
 * Taxa de cartão e de marketplace REAIS dos últimos N dias, a partir da
 * mesma diferença (valor_bruto − valor) que lib/financeiro-dre.ts já usa
 * pra "Taxas descontadas" — aqui só como sugestão (%, não R$) pra
 * preencher a config de precificação sem o usuário precisar adivinhar de
 * memória. Nunca aplicado sozinho — quem chama decide se usa.
 */
export async function buscarSugestaoDespesasVariaveis(dias = 30): Promise<SugestaoDespesasVariaveis> {
  const dataInicio = somarDias(hojeISO(), -dias)
  const { data, error } = await supabase
    .from('financeiro_receitas')
    .select('categoria, valor, valor_bruto')
    .gte('data', dataInicio)
    .lte('data', hojeISO())
  if (error) throw new Error(error.message)

  const cartao = (data || []).filter((r: any) => r.categoria === 'venda_cartao' && r.valor_bruto != null)
  const marketplace = (data || []).filter(
    (r: any) => (r.categoria === 'repasse_ifood' || r.categoria === 'repasse_aiqfome') && r.valor_bruto != null
  )

  const pctDaDiferenca = (linhas: any[]): number | null => {
    const totalBruto = linhas.reduce((s, r) => s + r.valor_bruto, 0)
    if (totalBruto === 0) return null
    const totalTaxa = linhas.reduce((s, r) => s + (r.valor_bruto - r.valor), 0)
    return (totalTaxa / totalBruto) * 100
  }

  return {
    taxaCartaoPct: pctDaDiferenca(cartao),
    taxaMarketplacePct: pctDaDiferenca(marketplace),
    diasConsiderados: dias,
  }
}
