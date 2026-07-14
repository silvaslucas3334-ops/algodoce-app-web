import { supabase } from './supabase'
import { UnidadeFinanceiro } from './types'

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
  usuarioId: string
): Promise<string> {
  const { data: cotacao, error: erroCotacao } = await supabase
    .from('financeiro_cotacoes')
    .insert({ titulo, unidade, criado_por: usuarioId })
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

export async function fecharCotacao(cotacaoId: string, fornecedorVencedorId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_cotacoes')
    .update({ status: 'fechada', fornecedor_vencedor_id: fornecedorVencedorId, fechado_em: new Date().toISOString() })
    .eq('id', cotacaoId)
  if (error) throw new Error(error.message)
}
