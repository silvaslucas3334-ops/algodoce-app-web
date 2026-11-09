import { supabase } from './supabase'
import { hojeISO, somarDias } from './financeiro-utils'

// Módulo Compras (/financeiro/compras): consultas feitas no servidor sobre as visões
// de lib/migrations/compras-fase5-views-e-funcoes.sql — filtros viram condições da query
// e as listas são paginadas (sem `.in(ids)` e sem o teto silencioso de 1000 linhas).

export type Periodo = 'mes' | 'mes_passado' | '30d' | '90d' | 'ano' | 'custom'

export const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'mes', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'ano', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
]

/** Datas (YYYY-MM-DD) de cada atalho de período, calculadas no fuso de São Paulo. */
export function intervaloDoPeriodo(periodo: Periodo, de = '', ate = ''): { inicio: string; fim: string } {
  const hoje = hojeISO()
  const [ano, mes] = hoje.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const ultimoDia = (a: number, m: number) => new Date(a, m, 0).getDate()
  switch (periodo) {
    case 'mes':
      return { inicio: `${ano}-${pad(mes)}-01`, fim: hoje }
    case 'mes_passado': {
      const a = mes === 1 ? ano - 1 : ano
      const m = mes === 1 ? 12 : mes - 1
      return { inicio: `${a}-${pad(m)}-01`, fim: `${a}-${pad(m)}-${pad(ultimoDia(a, m))}` }
    }
    case '30d':
      return { inicio: somarDias(hoje, -30), fim: hoje }
    case '90d':
      return { inicio: somarDias(hoje, -90), fim: hoje }
    case 'ano':
      return { inicio: `${ano}-01-01`, fim: hoje }
    case 'custom':
      return { inicio: de || somarDias(hoje, -30), fim: ate || hoje }
  }
}

// --- por insumo -------------------------------------------------------------------------

export interface ResumoInsumo {
  materia_prima_id: string
  nome: string
  unidade_medida: string
  unidade_compra: string
  fator_unidade_compra: number
  quantidade_convertida: number
  numero_compras: number
  gasto: number
  preco_medio_unidade_medida: number | null
  ultimo_preco_unidade_medida: number | null
  ultima_compra: string | null
  preco_anterior_unidade_medida: number | null
  variacao_pct: number | null
  fornecedor_principal: string | null
}

export async function buscarResumoPorInsumo(params: { inicio: string; fim: string; parteId?: string; busca?: string }): Promise<ResumoInsumo[]> {
  const { data, error } = await supabase.rpc('financeiro_compras_por_insumo', {
    p_inicio: params.inicio,
    p_fim: params.fim,
    p_parte: params.parteId || null,
    p_busca: params.busca?.trim() || null,
  })
  if (error) throw error
  // numeric vem como número já convertido pelo PostgREST; garante number mesmo se vier string
  return ((data || []) as any[]).map((r) => ({
    ...r,
    fator_unidade_compra: Number(r.fator_unidade_compra),
    quantidade_convertida: Number(r.quantidade_convertida),
    gasto: Number(r.gasto),
    preco_medio_unidade_medida: r.preco_medio_unidade_medida == null ? null : Number(r.preco_medio_unidade_medida),
    ultimo_preco_unidade_medida: r.ultimo_preco_unidade_medida == null ? null : Number(r.ultimo_preco_unidade_medida),
    preco_anterior_unidade_medida: r.preco_anterior_unidade_medida == null ? null : Number(r.preco_anterior_unidade_medida),
    variacao_pct: r.variacao_pct == null ? null : Number(r.variacao_pct),
  })) as ResumoInsumo[]
}

export async function buscarComprasSemItem(inicio: string, fim: string): Promise<{ quantidade: number; valor: number }> {
  const { data, error } = await supabase.rpc('financeiro_compras_sem_item', { p_inicio: inicio, p_fim: fim })
  if (error) throw error
  const linha = (data as any[])?.[0]
  return { quantidade: Number(linha?.quantidade || 0), valor: Number(linha?.valor || 0) }
}

// --- por compra (itens) ---------------------------------------------------------------------

export interface ItemCompra {
  id: string
  lancamento_id: string
  data_lancamento: string
  parte_id: string
  fornecedor_nome: string
  numero_documento: string | null
  materia_prima_id: string
  materia_prima_nome: string
  unidade_medida: string
  unidade_compra: string
  fator_unidade_compra: number
  quantidade: number
  unidade_nota: string
  quantidade_convertida: number
  valor_unitario: number
  valor_total: number
  preco_por_unidade_medida: number | null
}

export interface FiltroItens {
  inicio: string
  fim: string
  parteId?: string
  materiaPrimaId?: string
  busca?: string
}

export type OrdemItens = 'data' | 'valor' | 'insumo'
const COLUNA_ORDEM: Record<OrdemItens, { coluna: string; asc: boolean }> = {
  data: { coluna: 'data_lancamento', asc: false },
  valor: { coluna: 'valor_total', asc: false },
  insumo: { coluna: 'materia_prima_nome', asc: true },
}

function filtrarItens(query: any, f: FiltroItens) {
  query = query.gte('data_lancamento', f.inicio).lte('data_lancamento', f.fim)
  if (f.parteId) query = query.eq('parte_id', f.parteId)
  if (f.materiaPrimaId) query = query.eq('materia_prima_id', f.materiaPrimaId)
  if (f.busca?.trim()) query = query.ilike('materia_prima_nome', `%${f.busca.trim().replace(/[%,()*\\]/g, ' ')}%`)
  return query
}

/** Uma página de itens + total de itens do filtro. `id` por último: desempate estável entre páginas. */
export async function buscarPaginaItens(f: FiltroItens, ordem: OrdemItens, inicio: number, quantidade: number): Promise<{ itens: ItemCompra[]; total: number }> {
  const { coluna, asc } = COLUNA_ORDEM[ordem]
  const consulta = filtrarItens(supabase.from('financeiro_compras_itens_v').select('*', { count: 'exact' }), f)
    .order(coluna, { ascending: asc })
    .order('id')
  const { data, error, count } = await consulta.range(inicio, inicio + quantidade - 1)
  if (error) throw error
  return { itens: (data || []) as ItemCompra[], total: count ?? (data || []).length }
}

/** Soma do filtro inteiro (não só da página) — consulta leve, só o valor. */
export async function buscarTotalItens(f: FiltroItens): Promise<{ valor: number; compras: number }> {
  let valor = 0
  let compras = 0
  let inicio = 0
  while (true) {
    const { data, error } = await filtrarItens(supabase.from('financeiro_compras_itens_v').select('id, valor_total'), f)
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw error
    ;(data || []).forEach((l: any) => { valor += Number(l.valor_total) || 0; compras += 1 })
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return { valor, compras }
}

/** Todos os itens do filtro (para exportar CSV), em blocos de 1000. */
export async function buscarTodosItens(f: FiltroItens, ordem: OrdemItens): Promise<ItemCompra[]> {
  const { coluna, asc } = COLUNA_ORDEM[ordem]
  const linhas: ItemCompra[] = []
  let inicio = 0
  while (true) {
    const { data, error } = await filtrarItens(supabase.from('financeiro_compras_itens_v').select('*'), f)
      .order(coluna, { ascending: asc })
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw error
    linhas.push(...((data || []) as ItemCompra[]))
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return linhas
}

/** Últimas compras de UM insumo (linha expandida de "Por insumo"). */
export async function buscarUltimasComprasDoInsumo(materiaPrimaId: string, ate: string, parteId?: string, limite = 8): Promise<ItemCompra[]> {
  let q = supabase
    .from('financeiro_compras_itens_v')
    .select('*')
    .eq('materia_prima_id', materiaPrimaId)
    .lte('data_lancamento', ate)
    .order('data_lancamento', { ascending: false })
    .order('id')
    .limit(limite)
  if (parteId) q = q.eq('parte_id', parteId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as ItemCompra[]
}

// --- compatibilidade com Cotações ---------------------------------------------------------

/**
 * Quanto de um insumo foi comprado nos últimos N dias, já em unidade_medida. Mesma
 * assinatura de antes (usada em cotacoes/nova e cotacoes/[id]); agora lê a visão
 * plana em vez de montar uma lista de ids de notas.
 */
export async function buscarQuantidadeCompradaUltimosDias(materiaPrimaId: string, dias: number): Promise<number> {
  const hoje = hojeISO()
  let total = 0
  let inicio = 0
  while (true) {
    const { data, error } = await supabase
      .from('financeiro_compras_itens_v')
      .select('id, quantidade_convertida')
      .eq('materia_prima_id', materiaPrimaId)
      .gte('data_lancamento', somarDias(hoje, -dias))
      .lte('data_lancamento', hoje)
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw new Error(error.message)
    ;(data || []).forEach((l: any) => { total += Number(l.quantidade_convertida) || 0 })
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return total
}
