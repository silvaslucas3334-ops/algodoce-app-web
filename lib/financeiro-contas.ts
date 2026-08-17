import { supabase } from './supabase'
import { FinanceiroCentroCusto, FinanceiroConta, LinhaDre } from './types'

export async function buscarCentrosCusto(): Promise<FinanceiroCentroCusto[]> {
  const { data, error } = await supabase.from('financeiro_centros_custo').select('*').order('codigo')
  if (error) throw new Error(error.message)
  return data || []
}

export async function buscarContas(): Promise<FinanceiroConta[]> {
  const { data, error } = await supabase.from('financeiro_contas').select('*').order('codigo')
  if (error) throw new Error(error.message)
  return data || []
}

export interface DadosConta {
  codigo: string
  nome: string
  centro_custo_id: string
  grupo_dre: string
  linha_dre: LinhaDre | null
  aplicavel_a: 'compras_insumos' | 'despesas_gerais' | 'ambos'
  afeta_dre: boolean
  afeta_fluxo_caixa: boolean
}

export async function criarConta(dados: DadosConta): Promise<FinanceiroConta> {
  const { data, error } = await supabase.from('financeiro_contas').insert(dados).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function atualizarConta(
  id: string,
  dados: Partial<DadosConta> & { ativo?: boolean }
): Promise<void> {
  const { error } = await supabase.from('financeiro_contas').update(dados).eq('id', id)
  if (error) throw new Error(error.message)
}
