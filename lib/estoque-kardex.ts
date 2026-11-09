import { supabase } from './supabase'
import { hojeISO, somarDias } from './financeiro-utils'

// Ficha do produto (Posição de Estoque, 8b): histórico de movimentações de UM produto via as
// funções estoque_kardex / estoque_kardex_resumo (lib/migrations/estoque-fase8b-kardex.sql).

export interface KardexLinha {
  id: string
  em: string
  tipo: 'entrada' | 'saida' | 'transferencia'
  local_origem: string | null
  local_destino: string | null
  quantidade: number
  motivo: string | null
  justificativa: string | null
  registrado_por: string | null
  codigo_qr: string
  estorno: boolean // esta linha desfaz uma baixa
  estornado: boolean // esta baixa foi desfeita depois
  total_linhas: number
}

export interface KardexResumo {
  entradas: number
  transferencias: number
  baixas: number
  vendas: number
  perdas: number
  estornos: number
}

export type PeriodoKardex = '7d' | '30d' | '90d' | 'mes' | 'custom'

export const PERIODOS_KARDEX: { key: PeriodoKardex; label: string }[] = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'custom', label: 'Personalizado' },
]

export function intervaloKardex(periodo: PeriodoKardex, de: string, ate: string): { inicio: string; fim: string } {
  const hoje = hojeISO()
  switch (periodo) {
    case '7d':
      return { inicio: somarDias(hoje, -6), fim: hoje }
    case '90d':
      return { inicio: somarDias(hoje, -89), fim: hoje }
    case 'mes':
      return { inicio: hoje.slice(0, 8) + '01', fim: hoje }
    case 'custom':
      return { inicio: de || somarDias(hoje, -29), fim: ate || hoje }
    default:
      return { inicio: somarDias(hoje, -29), fim: hoje }
  }
}

interface ParamsKardex {
  produtoId: string
  inicio: string
  fim: string
  unidade: string // '' = todas
}

export async function buscarKardex(p: ParamsKardex & { limite: number; deslocamento: number }): Promise<{ linhas: KardexLinha[]; total: number }> {
  const { data, error } = await supabase.rpc('estoque_kardex', {
    p_produto: p.produtoId,
    p_inicio: p.inicio,
    p_fim: p.fim,
    p_unidade: p.unidade || null,
    p_limite: p.limite,
    p_deslocamento: p.deslocamento,
  })
  if (error) throw error
  const linhas = ((data || []) as any[]).map((l) => ({ ...l, quantidade: Number(l.quantidade) || 0, total_linhas: Number(l.total_linhas) || 0 })) as KardexLinha[]
  return { linhas, total: linhas[0]?.total_linhas ?? 0 }
}

export async function buscarKardexResumo(p: ParamsKardex): Promise<KardexResumo> {
  const { data, error } = await supabase.rpc('estoque_kardex_resumo', {
    p_produto: p.produtoId,
    p_inicio: p.inicio,
    p_fim: p.fim,
    p_unidade: p.unidade || null,
  })
  if (error) throw error
  const l = Array.isArray(data) ? data[0] : data
  const n = (v: any) => Number(v) || 0
  return { entradas: n(l?.entradas), transferencias: n(l?.transferencias), baixas: n(l?.baixas), vendas: n(l?.vendas), perdas: n(l?.perdas), estornos: n(l?.estornos) }
}
