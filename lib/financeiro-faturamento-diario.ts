import { supabase } from './supabase'
import { CategoriaFaturamentoDiario, FinanceiroFaturamentoDiario } from './types'

export const CATEGORIAS_FATURAMENTO_DIARIO: CategoriaFaturamentoDiario[] = [
  'dinheiro',
  'venda_cartao',
  'pix',
  'repasse_ifood',
  'repasse_aiqfome',
]

export function somaFaturamentoDiario(row: Pick<FinanceiroFaturamentoDiario, CategoriaFaturamentoDiario>): number {
  return CATEGORIAS_FATURAMENTO_DIARIO.reduce((soma, categoria) => soma + (row[categoria] || 0), 0)
}

/** Um dia+loja específico — usado pra pré-preencher o formulário ao reabrir um dia já lançado. */
export async function buscarFaturamentoDiario(unidade: 'loja1' | 'loja2', data: string): Promise<FinanceiroFaturamentoDiario | null> {
  const { data: row, error } = await supabase
    .from('financeiro_faturamento_diario')
    .select('*')
    .eq('unidade', unidade)
    .eq('data', data)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return row
}

/** Período — usado pelo merge com o PDV em buscarFaturamentoLoja. */
export async function buscarFaturamentoDiarioPeriodo(
  unidade: 'loja1' | 'loja2',
  dataMin: string,
  dataMax: string
): Promise<FinanceiroFaturamentoDiario[]> {
  const { data, error } = await supabase
    .from('financeiro_faturamento_diario')
    .select('*')
    .eq('unidade', unidade)
    .gte('data', dataMin)
    .lte('data', dataMax)
  if (error) throw new Error(error.message)
  return data || []
}

/** Cria ou atualiza o dia (upsert por unidade+data) — reabrir o mesmo dia edita, não duplica. */
export async function salvarFaturamentoDiario(
  unidade: 'loja1' | 'loja2',
  data: string,
  valores: Record<CategoriaFaturamentoDiario, number>,
  usuarioId: string
): Promise<void> {
  const { error } = await supabase
    .from('financeiro_faturamento_diario')
    .upsert(
      { unidade, data, ...valores, criado_por: usuarioId, updated_at: new Date().toISOString() },
      { onConflict: 'unidade,data' }
    )
  if (error) throw new Error(error.message)
}
