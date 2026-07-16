import { supabase } from './supabase'
import { FinanceiroPrePreparo, FinanceiroProdutoFinal } from './types'

// --- custo atual das matérias-primas -----------------------------------

/**
 * Custo mais recente por matéria-prima, a partir de
 * financeiro_custo_medio_mensal (única fonte de "quanto custa" — não
 * existe preço estático em lugar nenhum). Busca em lote (não N+1): uma
 * query com .in(), ordenada por mes_referencia DESC, e fica só com a
 * primeira ocorrência (mais recente) de cada id.
 */
export async function buscarCustosAtuaisMateriasPrimas(ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (ids.length === 0) return mapa
  const { data, error } = await supabase
    .from('financeiro_custo_medio_mensal')
    .select('materia_prima_id, mes_referencia, custo_medio_por_unidade_medida')
    .in('materia_prima_id', ids)
    .order('mes_referencia', { ascending: false })
  if (error) throw new Error(error.message)
  ;(data || []).forEach((row: any) => {
    if (!mapa.has(row.materia_prima_id)) mapa.set(row.materia_prima_id, row.custo_medio_por_unidade_medida)
  })
  return mapa
}

// --- cálculo de custo (2 níveis, incompletude propaga) ------------------

export interface ItemSemCusto {
  tipo: 'materia_prima' | 'pre_preparo'
  id: string
  nome: string
}

export interface CustoCalculado {
  custoTotal: number | null // null se QUALQUER linha contribuinte não tem custo conhecido
  custoConhecidoParcial: number // soma só das linhas conhecidas — nunca exibir como "o" custo
  completo: boolean
  itensSemCusto: ItemSemCusto[]
}

/**
 * Custo do pré-preparo = soma (quantidade × custo atual) das matérias-
 * primas da receita, dividido pelo rendimento. Se faltar custo de
 * qualquer matéria-prima (nunca foi comprada), o total fica null — nunca
 * tratado como zero, que subestimaria o custo silenciosamente.
 */
export function calcularCustoPrePreparo(
  prePreparo: FinanceiroPrePreparo,
  custosMP: Map<string, number>
): CustoCalculado & { custoPorUnidade: number | null } {
  const itens = prePreparo.itens || []
  let custoConhecidoParcial = 0
  const itensSemCusto: ItemSemCusto[] = []

  for (const item of itens) {
    const custo = custosMP.get(item.materia_prima_id)
    if (custo == null) {
      itensSemCusto.push({ tipo: 'materia_prima', id: item.materia_prima_id, nome: item.materia_prima?.nome || 'Matéria-prima' })
    } else {
      custoConhecidoParcial += item.quantidade * custo
    }
  }

  const completo = itensSemCusto.length === 0
  const custoTotal = completo ? custoConhecidoParcial : null
  const custoPorUnidade = custoTotal != null ? custoTotal / prePreparo.rendimento_quantidade : null
  return { custoTotal, custoConhecidoParcial, completo, itensSemCusto, custoPorUnidade }
}

/**
 * Custo do produto final = soma das linhas (matéria-prima direta ou
 * pré-preparo, pelo custo por unidade já calculado), dividido pelas
 * porções. Se um pré-preparo referenciado já está incompleto, a linha
 * entra em itensSemCusto também — a incompletude propaga pelos 2 níveis.
 */
export function calcularCustoProdutoFinal(
  produtoFinal: FinanceiroProdutoFinal,
  custosMP: Map<string, number>,
  custosPP: Map<string, CustoCalculado & { custoPorUnidade: number | null }>
): CustoCalculado & { custoPorPorcao: number | null } {
  const itens = produtoFinal.itens || []
  let custoConhecidoParcial = 0
  const itensSemCusto: ItemSemCusto[] = []

  for (const item of itens) {
    if (item.materia_prima_id) {
      const custo = custosMP.get(item.materia_prima_id)
      if (custo == null) {
        itensSemCusto.push({ tipo: 'materia_prima', id: item.materia_prima_id, nome: item.materia_prima?.nome || 'Matéria-prima' })
      } else {
        custoConhecidoParcial += item.quantidade * custo
      }
    } else if (item.pre_preparo_id) {
      const custoPP = custosPP.get(item.pre_preparo_id)
      if (!custoPP || custoPP.custoPorUnidade == null) {
        itensSemCusto.push({ tipo: 'pre_preparo', id: item.pre_preparo_id, nome: item.pre_preparo?.nome || 'Pré-preparo' })
      } else {
        custoConhecidoParcial += item.quantidade * custoPP.custoPorUnidade
      }
    }
  }

  const completo = itensSemCusto.length === 0
  const custoTotal = completo ? custoConhecidoParcial : null
  const custoPorPorcao = custoTotal != null ? custoTotal / produtoFinal.rendimento_porcoes : null
  return { custoTotal, custoConhecidoParcial, completo, itensSemCusto, custoPorPorcao }
}

// --- escrita: pré-preparo -------------------------------------------------

export async function criarPrePreparo(
  dados: { nome: string; unidade_medida: string; rendimento_quantidade: number; descricao: string | null },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_pre_preparos')
    .insert({ ...dados, criado_por: usuarioId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export interface ItemReceitaPayload {
  materia_prima_id: string
  quantidade: number
}

/**
 * Substitui o conjunto inteiro de linhas do pré-preparo (RPC — a tabela
 * de itens não tem policy de insert/update/delete direta, ver migration).
 * Cadastrar (ainda sem linha) e editar (já tem linhas) chamam a mesma função.
 */
export async function salvarItensPrePreparo(prePreparoId: string, itens: ItemReceitaPayload[]): Promise<void> {
  const { error } = await supabase.rpc('financeiro_pre_preparo_salvar_itens', {
    p_pre_preparo_id: prePreparoId,
    p_itens: itens,
  })
  if (error) throw new Error(error.message)
}

// --- escrita: produto final ------------------------------------------------

export async function criarProdutoFinal(
  dados: {
    nome: string
    codigo_pdv_loja1: string | null
    codigo_pdv_loja2: string | null
    rendimento_porcoes: number
    descricao: string | null
  },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_produtos_finais')
    .insert({ ...dados, criado_por: usuarioId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export interface ItemProdutoFinalPayload {
  materia_prima_id: string | null
  pre_preparo_id: string | null
  quantidade: number
}

export async function salvarItensProdutoFinal(produtoFinalId: string, itens: ItemProdutoFinalPayload[]): Promise<void> {
  const { error } = await supabase.rpc('financeiro_produto_final_salvar_itens', {
    p_produto_final_id: produtoFinalId,
    p_itens: itens,
  })
  if (error) throw new Error(error.message)
}
