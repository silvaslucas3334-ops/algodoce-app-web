import { supabase } from './supabase'
import { FinanceiroOrcamento, FinanceiroRecorrencia, TipoLancamento, UnidadeOrcamento } from './types'

// Ordem das colunas por dia da semana no banco — índice 0=domingo..6=sábado,
// igual Date.getDay() e DIA_SEMANA_LABEL em components/FluxoMensalTabela.tsx.
const SUFIXOS_DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const

function colunasParaArray(row: any, prefixo: 'meta_venda' | 'entrada_prevista'): (number | null)[] {
  return SUFIXOS_DIA_SEMANA.map((sufixo) => row[`${prefixo}_${sufixo}`] ?? null)
}

function arrayParaColunas(valores: (number | null)[], prefixo: 'meta_venda' | 'entrada_prevista'): Record<string, number | null> {
  const colunas: Record<string, number | null> = {}
  SUFIXOS_DIA_SEMANA.forEach((sufixo, i) => {
    colunas[`${prefixo}_${sufixo}`] = valores[i] ?? null
  })
  return colunas
}

export async function buscarOrcamento(ano: number, mes: number, unidade: UnidadeOrcamento): Promise<FinanceiroOrcamento | null> {
  const { data, error } = await supabase
    .from('financeiro_orcamentos')
    .select('*, itens:financeiro_orcamento_itens(*, parte:financeiro_partes(nome), conta:financeiro_contas(codigo, nome, grupo_dre))')
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('unidade', unidade)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    ...data,
    metaVendaPorDiaSemana: colunasParaArray(data, 'meta_venda'),
    entradaPrevistaPorDiaSemana: colunasParaArray(data, 'entrada_prevista'),
  }
}

/**
 * Cria ou atualiza o orçamento do mês (meta de venda + previsão de
 * entrada por dia da semana + saldo inicial) num passo só — chave única
 * (ano, mes, unidade) garante que nunca duplica.
 */
export async function salvarOrcamento(
  ano: number,
  mes: number,
  unidade: UnidadeOrcamento,
  dados: { metaVendaPorDiaSemana: (number | null)[]; entradaPrevistaPorDiaSemana: (number | null)[]; saldo_inicial: number | null },
  usuarioId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('financeiro_orcamentos')
    .upsert(
      {
        ano,
        mes,
        unidade,
        ...arrayParaColunas(dados.metaVendaPorDiaSemana, 'meta_venda'),
        ...arrayParaColunas(dados.entradaPrevistaPorDiaSemana, 'entrada_prevista'),
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
