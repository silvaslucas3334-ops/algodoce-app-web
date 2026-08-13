import { supabase } from './supabase'
import { UnidadeFinanceiro, TipoCotacao, FinanceiroCotacaoItem } from './types'
import { buscarCustosAtuaisMateriasPrimas } from './financeiro-cmv'

export interface NovoItemCotacao {
  materia_prima_id: string
  quantidade: number
  unidade_cotacao: string
  observacao?: string
}

/**
 * Cria a cotação + itens + fornecedores convidados. Três INSERTs
 * sequenciais (não atômico) — se falhar no meio, a cotação fica visível
 * mas incompleta; o usuário pode conferir na tela de detalhe e recriar
 * se necessário (mesmo padrão de risco aceito em outros fluxos de criação
 * multi-tabela deste módulo, ex: nota + itens em compras/nova).
 */
export async function criarCotacao(
  titulo: string,
  unidade: UnidadeFinanceiro,
  itens: NovoItemCotacao[],
  fornecedorIds: string[],
  usuarioId: string,
  dataEntregaPlanejada?: string,
  tipo: TipoCotacao = 'fornecedores'
): Promise<string> {
  const { data: cotacao, error: erroCotacao } = await supabase
    .from('financeiro_cotacoes')
    .insert({ titulo, unidade, tipo, criado_por: usuarioId, data_entrega_planejada: dataEntregaPlanejada || null })
    .select('id')
    .single()
  if (erroCotacao) throw new Error(erroCotacao.message)

  const { error: erroItens } = await supabase.from('financeiro_cotacao_itens').insert(
    itens.map((i) => ({
      cotacao_id: cotacao.id,
      materia_prima_id: i.materia_prima_id,
      quantidade: i.quantidade,
      unidade_cotacao: i.unidade_cotacao,
      observacao: i.observacao || null,
    }))
  )
  if (erroItens) throw new Error(erroItens.message)

  const { error: erroFornecedores } = await supabase.from('financeiro_cotacao_fornecedores').insert(
    fornecedorIds.map((parteId) => ({ cotacao_id: cotacao.id, parte_id: parteId }))
  )
  if (erroFornecedores) throw new Error(erroFornecedores.message)

  return cotacao.id
}

export interface RespostaItemCotacao {
  cotacao_item_id: string
  valor_unitario: number | null
  valor_total: number | null
  disponivel: boolean
  fator_conversao_fornecedor: number | null
}

/**
 * Registra os preços de um fornecedor pra uma cotação inteira numa única
 * transação no banco (RPC), evitando estado parcial se o upsert de N
 * itens falhar no meio.
 */
export async function responderCotacaoFornecedor(
  cotacaoFornecedorId: string,
  precos: RespostaItemCotacao[]
): Promise<void> {
  const { error } = await supabase.rpc('financeiro_cotacao_responder', {
    p_cotacao_fornecedor_id: cotacaoFornecedorId,
    p_precos: precos,
  })
  if (error) throw new Error(error.message)
}

/**
 * Atualiza o preço (por unidade de compra) de UM item já vinculado a um
 * fornecedor — reaproveita a mesma RPC de responderCotacaoFornecedor, só
 * com um array de 1 elemento. valor_total nunca é digitado, sempre
 * calculado aqui (mesmo princípio aplicado em SelecionarMateriaPrimaModal.tsx:
 * o total é sempre quantidade × preço unitário, nunca um campo à parte).
 * valorUnitario <= 0 grava como indisponível, mesma regra de sempre.
 */
export async function atualizarPrecoItemCotacao(
  cotacaoFornecedorId: string,
  cotacaoItemId: string,
  valorUnitario: number,
  quantidade: number
): Promise<void> {
  const disponivel = valorUnitario > 0
  await responderCotacaoFornecedor(cotacaoFornecedorId, [
    {
      cotacao_item_id: cotacaoItemId,
      valor_unitario: disponivel ? valorUnitario : null,
      valor_total: disponivel ? Number((valorUnitario * quantidade).toFixed(2)) : null,
      disponivel,
      fator_conversao_fornecedor: null,
    },
  ])
}

export async function fecharCotacao(cotacaoId: string, fornecedorVencedorId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_cotacoes')
    .update({ status: 'fechada', fornecedor_vencedor_id: fornecedorVencedorId, fechado_em: new Date().toISOString() })
    .eq('id', cotacaoId)
  if (error) throw new Error(error.message)
}

// --- cotação tipo 'estimativa' — preço a partir do histórico, sem pedido -----

export interface ItemParaEstimar {
  materia_prima_id: string
  quantidade: number
  fator_conversao: number // unidade_medida por 1 unidade_compra (cadastro da matéria-prima)
}

export interface PrecoEstimado {
  valor_unitario: number | null // por unidade_cotacao (= unidade_compra), mesma convenção de financeiro_cotacao_precos
  valor_total: number | null
}

/**
 * Estima o preço de uma lista de itens pra UM fornecedor específico
 * (cotação tipo 'estimativa'), com fallback em duas camadas:
 * 1) histórico real de compra DESSE item com ESSE fornecedor
 *    (financeiro_custo_por_fornecedor, filtrado por parte_id) — mais
 *    específico;
 * 2) sem histórico com esse fornecedor, cai no custo atual geral do item
 *    (buscarCustosAtuaisMateriasPrimas — manual ou mês mais recente com
 *    compra, de qualquer fornecedor);
 * 3) sem nenhum dos dois, fica null — nunca fabrica um 0.
 * Ambas as fontes dão custo por unidade_medida; convertido pra
 * valor_unitario por unidade_cotacao via fator_conversao, igual à
 * convenção de financeiro_cotacao_precos.valor_unitario.
 */
export async function estimarPrecosCotacao(
  itens: ItemParaEstimar[],
  fornecedorParteId: string
): Promise<Map<string, PrecoEstimado>> {
  const resultado = new Map<string, PrecoEstimado>()
  if (itens.length === 0) return resultado
  const ids = itens.map((i) => i.materia_prima_id)

  const [{ data: porFornecedor, error: erroFornecedor }, custosGerais] = await Promise.all([
    supabase
      .from('financeiro_custo_por_fornecedor')
      .select('materia_prima_id, custo_medio_por_unidade_medida')
      .in('materia_prima_id', ids)
      .eq('parte_id', fornecedorParteId),
    buscarCustosAtuaisMateriasPrimas(ids),
  ])
  if (erroFornecedor) throw new Error(erroFornecedor.message)

  const custoEspecificoPorId = new Map<string, number>()
  ;(porFornecedor || []).forEach((row: any) => {
    if (row.custo_medio_por_unidade_medida != null) custoEspecificoPorId.set(row.materia_prima_id, row.custo_medio_por_unidade_medida)
  })

  for (const item of itens) {
    const custoPorUnidadeMedida = custoEspecificoPorId.get(item.materia_prima_id) ?? custosGerais.get(item.materia_prima_id)?.custo ?? null
    if (custoPorUnidadeMedida == null) {
      resultado.set(item.materia_prima_id, { valor_unitario: null, valor_total: null })
      continue
    }
    const valorUnitario = custoPorUnidadeMedida * item.fator_conversao
    resultado.set(item.materia_prima_id, {
      valor_unitario: valorUnitario,
      valor_total: Number((valorUnitario * item.quantidade).toFixed(2)),
    })
  }
  return resultado
}

/**
 * Cria uma cotação tipo 'estimativa' (lista de compra à vista, UM
 * fornecedor): cria cotação+itens+fornecedor via criarCotacao, busca de
 * volta os IDs gerados, estima o preço de cada item pra esse fornecedor e
 * persiste via a RPC financeiro_cotacao_responder já existente (marca o
 * fornecedor como 'respondido' de quebra — aceitável, é o único
 * fornecedor e não há resposta manual nesse fluxo).
 */
export async function criarCotacaoEstimativa(
  titulo: string,
  unidade: UnidadeFinanceiro,
  itens: NovoItemCotacao[],
  fornecedorId: string,
  usuarioId: string,
  dataEntregaPlanejada?: string
): Promise<string> {
  const cotacaoId = await criarCotacao(titulo, unidade, itens, [fornecedorId], usuarioId, dataEntregaPlanejada, 'estimativa')

  const [{ data: itensInseridos, error: erroItens }, { data: cotacaoFornecedor, error: erroFornecedor }] = await Promise.all([
    supabase
      .from('financeiro_cotacao_itens')
      .select('id, materia_prima_id, quantidade, materia_prima:financeiro_materias_primas(fator_conversao)')
      .eq('cotacao_id', cotacaoId),
    supabase
      .from('financeiro_cotacao_fornecedores')
      .select('id')
      .eq('cotacao_id', cotacaoId)
      .eq('parte_id', fornecedorId)
      .single(),
  ])
  if (erroItens) throw new Error(erroItens.message)
  if (erroFornecedor) throw new Error(erroFornecedor.message)

  const paraEstimar: ItemParaEstimar[] = (itensInseridos || []).map((i: any) => ({
    materia_prima_id: i.materia_prima_id,
    quantidade: i.quantidade,
    fator_conversao: i.materia_prima?.fator_conversao ?? 1,
  }))
  const estimativas = await estimarPrecosCotacao(paraEstimar, fornecedorId)

  const precos: RespostaItemCotacao[] = (itensInseridos || []).map((i: any) => {
    const est = estimativas.get(i.materia_prima_id) ?? { valor_unitario: null, valor_total: null }
    return {
      cotacao_item_id: i.id,
      valor_unitario: est.valor_unitario,
      valor_total: est.valor_total,
      disponivel: est.valor_unitario != null,
      fator_conversao_fornecedor: null,
    }
  })
  await responderCotacaoFornecedor(cotacaoFornecedor.id, precos)

  return cotacaoId
}

// --- edição geral de itens (os dois tipos de cotação) -----------------------

const ITEM_SELECT =
  '*, materia_prima:financeiro_materias_primas(nome, unidade_medida, fator_conversao, unidade_fornecedor, fator_unidade_fornecedor)'

export async function adicionarItemCotacao(cotacaoId: string, item: NovoItemCotacao): Promise<FinanceiroCotacaoItem> {
  const { data, error } = await supabase
    .from('financeiro_cotacao_itens')
    .insert({
      cotacao_id: cotacaoId,
      materia_prima_id: item.materia_prima_id,
      quantidade: item.quantidade,
      unidade_cotacao: item.unidade_cotacao,
      observacao: item.observacao || null,
    })
    .select(ITEM_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function atualizarQuantidadeItemCotacao(itemId: string, quantidade: number): Promise<void> {
  const { error } = await supabase.from('financeiro_cotacao_itens').update({ quantidade }).eq('id', itemId)
  if (error) throw new Error(error.message)
}

// Só funciona com a cotação 'aberta' (RLS) — item de cotação fechada vira
// histórico e não pode mais ser removido.
export async function removerItemCotacao(itemId: string): Promise<void> {
  const { error } = await supabase.from('financeiro_cotacao_itens').delete().eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function marcarItemComprado(itemId: string, comprado: boolean): Promise<void> {
  const { error } = await supabase.from('financeiro_cotacao_itens').update({ comprado }).eq('id', itemId)
  if (error) throw new Error(error.message)
}
