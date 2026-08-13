import { supabase } from './supabase'
import { hojeISO, somarDias } from './financeiro-utils'

export interface CompraItemRelatorio {
  id: string
  lancamentoId: string
  dataLancamento: string
  materiaPrimaId: string
  materiaPrimaNome: string
  unidadeMedida: string
  fornecedorNome: string
  quantidade: number // na unidade_nota
  unidadeNota: string
  quantidadeConvertida: number // quantidade * fator_conversao, já em unidade_medida
  valorUnitario: number
  valorTotal: number
}

export interface FiltroComprasRelatorio {
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  materiaPrimaId?: string
  parteId?: string
}

/**
 * Compras individuais (linhas de nota) no período, com filtro opcional por
 * matéria-prima/fornecedor. Mesmo padrão de 2 passos do DRE
 * (lib/financeiro-dre.ts, buscarDre): lançamentos do tipo/período certos
 * primeiro, depois os itens via .in('lancamento_id', ids) — financeiro_
 * lancamento_itens não tem data própria. Usa data_lancamento (não
 * data_competencia) — é o mesmo campo que já governa
 * financeiro_custo_medio_mensal, então o período bate com o resto do
 * módulo de custos.
 */
export async function buscarComprasRelatorio(filtro: FiltroComprasRelatorio): Promise<CompraItemRelatorio[]> {
  let queryLancamentos = supabase
    .from('financeiro_lancamentos')
    .select('id, data_lancamento, parte:financeiro_partes!parte_id(nome)')
    .eq('tipo', 'compra_insumos')
    .neq('status', 'cancelado')
    .gte('data_lancamento', filtro.dataInicio)
    .lte('data_lancamento', filtro.dataFim)
  if (filtro.parteId) queryLancamentos = queryLancamentos.eq('parte_id', filtro.parteId)

  const { data: lancamentos, error: erroLancamentos } = await queryLancamentos
  if (erroLancamentos) throw new Error(erroLancamentos.message)
  const ids = (lancamentos || []).map((l: any) => l.id)
  if (ids.length === 0) return []

  let queryItens = supabase
    .from('financeiro_lancamento_itens')
    .select(
      'id, lancamento_id, quantidade, unidade_nota, fator_conversao, valor_unitario, valor_total, materia_prima:financeiro_materias_primas(id, nome, unidade_medida)'
    )
    .in('lancamento_id', ids)
  if (filtro.materiaPrimaId) queryItens = queryItens.eq('materia_prima_id', filtro.materiaPrimaId)

  const { data: itens, error: erroItens } = await queryItens
  if (erroItens) throw new Error(erroItens.message)

  const lancamentoPorId = new Map((lancamentos || []).map((l: any) => [l.id, l]))
  return (itens || [])
    .map((item: any) => {
      const lancamento = lancamentoPorId.get(item.lancamento_id)
      if (!lancamento) return null
      return {
        id: item.id,
        lancamentoId: item.lancamento_id,
        dataLancamento: lancamento.data_lancamento,
        materiaPrimaId: item.materia_prima?.id || '',
        materiaPrimaNome: item.materia_prima?.nome || 'Matéria-prima',
        unidadeMedida: item.materia_prima?.unidade_medida || '',
        fornecedorNome: lancamento.parte?.nome || 'Fornecedor',
        quantidade: item.quantidade,
        unidadeNota: item.unidade_nota,
        quantidadeConvertida: item.quantidade * item.fator_conversao,
        valorUnitario: item.valor_unitario,
        valorTotal: item.valor_total,
      }
    })
    .filter((i): i is CompraItemRelatorio => i !== null)
    .sort((a, b) => b.dataLancamento.localeCompare(a.dataLancamento))
}

export interface ResumoComprasRelatorio {
  quantidadeTotal: number | null // só quando filtrado a 1 matéria-prima; null = unidades diferentes, não faz sentido somar
  unidadeMedida: string | null
  valorTotal: number
  numeroCompras: number
}

export function resumirComprasRelatorio(itens: CompraItemRelatorio[], materiaPrimaId?: string): ResumoComprasRelatorio {
  const valorTotal = itens.reduce((s, i) => s + i.valorTotal, 0)
  if (!materiaPrimaId) return { quantidadeTotal: null, unidadeMedida: null, valorTotal, numeroCompras: itens.length }
  return {
    quantidadeTotal: itens.reduce((s, i) => s + i.quantidadeConvertida, 0),
    unidadeMedida: itens[0]?.unidadeMedida || null,
    valorTotal,
    numeroCompras: itens.length,
  }
}

/**
 * Quanto de uma matéria-prima foi comprado nos últimos N dias, já somado em
 * unidade_medida (unidade da ficha técnica) — reaproveita buscarComprasRelatorio
 * filtrado por item e período. Usada no painel "comprado na última semana" da
 * Lista de Compras (cotação tipo 'estimativa').
 */
export async function buscarQuantidadeCompradaUltimosDias(materiaPrimaId: string, dias: number): Promise<number> {
  const itens = await buscarComprasRelatorio({
    dataInicio: somarDias(hojeISO(), -dias),
    dataFim: hojeISO(),
    materiaPrimaId,
  })
  return itens.reduce((s, i) => s + i.quantidadeConvertida, 0)
}
