import { supabase } from './supabase'
import { FinanceiroOrcamento, FinanceiroRecorrencia, TipoLancamento, UnidadeOrcamento } from './types'

export async function buscarOrcamento(ano: number, mes: number, unidade: UnidadeOrcamento): Promise<FinanceiroOrcamento | null> {
  const { data, error } = await supabase
    .from('financeiro_orcamentos')
    .select('*, itens:financeiro_orcamento_itens(*, parte:financeiro_partes(nome), conta:financeiro_contas(codigo, nome, grupo_dre))')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('unidade', unidade)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

/**
 * Cria ou atualiza o orçamento do mês (meta de venda + saldo inicial) num
 * passo só — chave única (ano, mes, unidade) garante que nunca duplica.
 */
export async function salvarOrcamento(
  ano: number,
  mes: number,
  unidade: UnidadeOrcamento,
  dados: { valor_meta_venda: number | null; saldo_inicial: number | null },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_orcamentos')
    .upsert(
      {
        ano,
        mes,
        unidade,
        valor_meta_venda: dados.valor_meta_venda,
        saldo_inicial: dados.saldo_inicial,
        criado_por: usuarioId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ano,mes,unidade' }
    )
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export interface ItemOrcamentoPayload {
  tipo: TipoLancamento
  parte_id: string | null
  conta_id: string | null
  valor_previsto: number
  observacao: string | null
}

/**
 * Substitui o conjunto inteiro de linhas manuais do orçamento (RPC — a
 * tabela de itens não tem policy de insert/update/delete direta, é um
 * rascunho editável o mês inteiro e DELETE é bloqueado por convenção).
 */
export async function salvarItensOrcamento(orcamentoId: string, itens: ItemOrcamentoPayload[]): Promise<void> {
  const { error } = await supabase.rpc('financeiro_orcamento_salvar_itens', {
    p_orcamento_id: orcamentoId,
    p_itens: itens,
  })
  if (error) throw new Error(error.message)
}

/**
 * Recorrências ativas da empresa inteira (loja1+loja2+rateio) — seção "já
 * garantido pela recorrência" do orçamento, só leitura (não duplica como
 * item manual). Despesas orçadas são consolidadas, sem distinção de
 * unidade, então a lista também é.
 */
export async function buscarRecorrenciasAtivas(): Promise<FinanceiroRecorrencia[]> {
  const { data, error } = await supabase
    .from('financeiro_recorrencias')
    .select('*, parte:financeiro_partes(nome), conta:financeiro_contas(codigo, nome)')
    .eq('ativa', true)
    .order('dia_vencimento')
  if (error) throw new Error(error.message)
  return data || []
}
