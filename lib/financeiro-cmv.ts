import { supabase } from './supabase'
import { FinanceiroPrePreparo, FinanceiroProdutoFinal, StatusFichaTecnica } from './types'
import { diferencaEmMeses, hojeISO } from './financeiro-utils'

// --- custo atual das matérias-primas -----------------------------------

export interface CustoAtualMateriaPrima {
  custo: number
  origem: 'manual' | 'calculado'
  mesReferencia: string | null // YYYY-MM-01; null quando origem='manual'
  mesesAtras: number | null
  desatualizado: boolean // origem==='calculado' && mesesAtras >= 2
  temComprasRegistradas: boolean // true mesmo com origem='manual', se já há histórico (aciona o aviso pra trocar pro cálculo automático)
}

/**
 * Custo atual por matéria-prima, com proveniência — fonte única usada em
 * TODO lugar que mostra "quanto custa" (lista, detalhe, Ficha Técnica).
 * Regra: custo manual (financeiro_materias_primas.custo_manual_por_unidade_compra)
 * sempre GANHA e nem passa pelo fallback de mês — curto-circuita antes.
 * Sem override, cai no cálculo de sempre: mês mais recente com QUALQUER
 * compra em financeiro_custo_medio_mensal, por antigo que seja, com
 * mesesAtras/desatualizado calculados a partir dele. Busca em lote (não
 * N+1): duas queries com .in(), nunca uma por item.
 */
export async function buscarCustosAtuaisMateriasPrimas(ids: string[]): Promise<Map<string, CustoAtualMateriaPrima>> {
  const mapa = new Map<string, CustoAtualMateriaPrima>()
  if (ids.length === 0) return mapa

  const [{ data: materias, error: erroManual }, { data: mensal, error: erroMensal }] = await Promise.all([
    supabase.from('financeiro_materias_primas').select('id, custo_manual_por_unidade_compra, fator_conversao').in('id', ids),
    supabase
      .from('financeiro_custo_medio_mensal')
      .select('materia_prima_id, mes_referencia, custo_medio_por_unidade_medida')
      .in('materia_prima_id', ids)
      .order('mes_referencia', { ascending: false }),
  ])
  if (erroManual) throw new Error(erroManual.message)
  if (erroMensal) throw new Error(erroMensal.message)

  const maisRecentePorId = new Map<string, { mes_referencia: string; custo: number }>()
  const temComprasPorId = new Set<string>()
  ;(mensal || []).forEach((row: any) => {
    temComprasPorId.add(row.materia_prima_id)
    if (!maisRecentePorId.has(row.materia_prima_id)) {
      maisRecentePorId.set(row.materia_prima_id, { mes_referencia: row.mes_referencia, custo: row.custo_medio_por_unidade_medida })
    }
  })

  ;(materias || []).forEach((mp: any) => {
    const temCompras = temComprasPorId.has(mp.id)

    if (mp.custo_manual_por_unidade_compra != null) {
      mapa.set(mp.id, {
        custo: mp.custo_manual_por_unidade_compra / mp.fator_conversao,
        origem: 'manual',
        mesReferencia: null,
        mesesAtras: null,
        desatualizado: false,
        temComprasRegistradas: temCompras,
      })
      return
    }

    const recente = maisRecentePorId.get(mp.id)
    if (!recente) return // sem custo manual e sem nenhuma compra -> fica de fora do mapa (custo desconhecido)

    const mesesAtras = diferencaEmMeses(recente.mes_referencia, hojeISO())
    mapa.set(mp.id, {
      custo: recente.custo,
      origem: 'calculado',
      mesReferencia: recente.mes_referencia,
      mesesAtras,
      desatualizado: mesesAtras >= 2,
      temComprasRegistradas: true,
    })
  })

  return mapa
}

// --- cálculo de custo (2 níveis, incompletude propaga) ------------------

export interface ItemSemCusto {
  tipo: 'materia_prima' | 'pre_preparo' | 'produto_final'
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
  custosMP: Map<string, CustoAtualMateriaPrima>
): CustoCalculado & { custoPorUnidade: number | null } {
  const itens = prePreparo.itens || []
  let custoConhecidoParcial = 0
  const itensSemCusto: ItemSemCusto[] = []

  for (const item of itens) {
    const entry = custosMP.get(item.materia_prima_id)
    if (entry == null) {
      itensSemCusto.push({ tipo: 'materia_prima', id: item.materia_prima_id, nome: item.materia_prima?.nome || 'Matéria-prima' })
    } else {
      custoConhecidoParcial += item.quantidade * entry.custo
    }
  }

  const completo = itensSemCusto.length === 0
  const custoTotal = completo ? custoConhecidoParcial : null
  const custoPorUnidade = custoTotal != null ? custoTotal / prePreparo.rendimento_quantidade : null
  return { custoTotal, custoConhecidoParcial, completo, itensSemCusto, custoPorUnidade }
}

/**
 * Custo do produto final = soma das linhas (matéria-prima direta,
 * pré-preparo, ou outro produto final usado como componente/combo — pelo
 * custo por unidade/porção já calculado), dividido pelas porções. Se uma
 * linha referenciada já está incompleta, a linha entra em itensSemCusto
 * também — a incompletude propaga pelos níveis.
 *
 * `custosPF` é opcional: só produtos com hierarquização (combos) usam.
 * Como a hierarquia é travada em 1 nível (trigger no banco — um combo
 * nunca contém outro combo), o componente referenciado nunca precisa do
 * próprio `custosPF` pra ser calculado — dá pra calcular todos os
 * elegíveis numa primeira passada e os combos numa segunda, sem
 * recursão.
 */
export function calcularCustoProdutoFinal(
  produtoFinal: FinanceiroProdutoFinal,
  custosMP: Map<string, CustoAtualMateriaPrima>,
  custosPP: Map<string, CustoCalculado & { custoPorUnidade: number | null }>,
  custosPF?: Map<string, CustoCalculado & { custoPorPorcao: number | null }>
): CustoCalculado & { custoPorPorcao: number | null } {
  const itens = produtoFinal.itens || []
  let custoConhecidoParcial = 0
  const itensSemCusto: ItemSemCusto[] = []

  for (const item of itens) {
    if (item.materia_prima_id) {
      const entry = custosMP.get(item.materia_prima_id)
      if (entry == null) {
        itensSemCusto.push({ tipo: 'materia_prima', id: item.materia_prima_id, nome: item.materia_prima?.nome || 'Matéria-prima' })
      } else {
        custoConhecidoParcial += item.quantidade * entry.custo
      }
    } else if (item.pre_preparo_id) {
      const custoPP = custosPP.get(item.pre_preparo_id)
      if (!custoPP || custoPP.custoPorUnidade == null) {
        itensSemCusto.push({ tipo: 'pre_preparo', id: item.pre_preparo_id, nome: item.pre_preparo?.nome || 'Pré-preparo' })
      } else {
        custoConhecidoParcial += item.quantidade * custoPP.custoPorUnidade
      }
    } else if (item.produto_final_componente_id) {
      const custoPF = custosPF?.get(item.produto_final_componente_id)
      if (!custoPF || custoPF.custoPorPorcao == null) {
        itensSemCusto.push({ tipo: 'produto_final', id: item.produto_final_componente_id, nome: item.produto_final_componente?.nome || 'Produto final' })
      } else {
        custoConhecidoParcial += item.quantidade * custoPF.custoPorPorcao
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
  dados: { nome: string; unidade_medida: string; rendimento_quantidade: number; descricao: string | null; status?: StatusFichaTecnica },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_pre_preparos')
    .insert({ ...dados, criado_por: usuarioId })
    .select('id')
    .single()
  if (error) throw error
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
  if (error) throw error
}

// --- escrita: produto final ------------------------------------------------

export async function criarProdutoFinal(
  dados: {
    nome: string
    codigo_pdv_loja1: string | null
    codigo_pdv_loja2: string | null
    rendimento_porcoes: number
    descricao: string | null
    status?: StatusFichaTecnica
    permite_hierarquizacao?: boolean
  },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_produtos_finais')
    .insert({ ...dados, criado_por: usuarioId })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export interface ItemProdutoFinalPayload {
  materia_prima_id: string | null
  pre_preparo_id: string | null
  produto_final_componente_id: string | null
  quantidade: number
}

export async function salvarItensProdutoFinal(produtoFinalId: string, itens: ItemProdutoFinalPayload[]): Promise<void> {
  const { error } = await supabase.rpc('financeiro_produto_final_salvar_itens', {
    p_produto_final_id: produtoFinalId,
    p_itens: itens,
  })
  if (error) throw error
}
