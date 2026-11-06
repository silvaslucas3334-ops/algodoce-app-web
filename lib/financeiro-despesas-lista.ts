import { supabase } from './supabase'
import { EtiquetaAprovacao, FinanceiroLancamento } from './types'
import { hojeISO, somarDias } from './financeiro-utils'

// Consulta da tela Despesas (/financeiro/despesas), feita no servidor: filtros
// viram condições da query e as listas grandes são paginadas. Antes a tela
// baixava TODOS os lançamentos do status escolhido e filtrava no navegador —
// o que esbarra no teto silencioso de 1000 linhas do PostgREST assim que
// "Pagas" crescer.

export type StatusLista = 'atrasadas' | 'vence7' | 'aberto' | 'pagas' | 'canceladas' | 'todas'
export type FiltroEtiqueta = 'todas' | 'sem_etiqueta' | EtiquetaAprovacao
export type Agrupamento = 'mes' | 'etiqueta'

export interface FiltrosDespesas {
  status: StatusLista
  q: string // texto livre: descrição, fornecedor ou conta
  parteId: string // fornecedor/beneficiário
  etiqueta: FiltroEtiqueta
  de: string // vencimento a partir de (YYYY-MM-DD)
  ate: string // vencimento até
  agrupar: Agrupamento // só apresentação (Em aberto) — não entra na consulta
}

const STATUS_VALIDOS: StatusLista[] = ['atrasadas', 'vence7', 'aberto', 'pagas', 'canceladas', 'todas']
const ETIQUETAS_VALIDAS = ['sem_etiqueta', 'planejar_pagamento', 'aprovada_pagamento']

/** Conjuntos naturalmente pequenos: carrega tudo (necessário pra agrupar por mês/etiqueta). */
export const STATUS_CARGA_COMPLETA: StatusLista[] = ['atrasadas', 'vence7', 'aberto']
/** Conjuntos que só crescem (histórico): paginados com "Carregar mais". */
export const TAMANHO_PAGINA = 50

export const SELECT_LISTA =
  '*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome), extrato_transacao:financeiro_extrato_transacoes!extrato_transacao_id(status_conciliacao)'

export function statusPadrao(parteId: string): StatusLista {
  // Quem escolhe um fornecedor quer o histórico dele (em aberto + pago), não só o que falta pagar.
  return parteId ? 'todas' : 'aberto'
}

/** Lê os filtros da URL. Parâmetro ausente ou inválido cai no padrão — URL sem nada = tela de sempre. */
export function lerFiltros(sp: { get(nome: string): string | null }): FiltrosDespesas {
  const parteId = sp.get('parte') || ''
  const statusParam = sp.get('status') as StatusLista | null
  const etq = sp.get('etq') || ''
  return {
    status: statusParam && STATUS_VALIDOS.includes(statusParam) ? statusParam : statusPadrao(parteId),
    q: sp.get('q') || '',
    parteId,
    etiqueta: ETIQUETAS_VALIDAS.includes(etq) ? (etq as FiltroEtiqueta) : 'todas',
    de: sp.get('de') || '',
    ate: sp.get('ate') || '',
    agrupar: sp.get('agr') === 'etiqueta' ? 'etiqueta' : 'mes',
  }
}

/** Monta a query string só com o que foge do padrão (URL curta e legível). */
export function filtrosParaQuery(f: FiltrosDespesas): string {
  const p = new URLSearchParams()
  if (f.status !== statusPadrao(f.parteId)) p.set('status', f.status)
  if (f.q) p.set('q', f.q)
  if (f.parteId) p.set('parte', f.parteId)
  if (f.etiqueta !== 'todas') p.set('etq', f.etiqueta)
  if (f.de) p.set('de', f.de)
  if (f.ate) p.set('ate', f.ate)
  if (f.agrupar !== 'mes') p.set('agr', f.agrupar)
  return p.toString()
}

/** Tira o que quebraria a sintaxe do filtro `or(...)` do PostgREST. */
function limparBusca(q: string): string {
  return q.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Texto livre → expressão `or(...)`: descrição OU fornecedor OU conta que
 * contenham o texto. Fornecedor e conta são resolvidos antes (tabelas pequenas)
 * porque o PostgREST não filtra por coluna de tabela embutida dentro de um `or`.
 */
async function expressaoBusca(q: string): Promise<string | null> {
  const texto = limparBusca(q)
  if (!texto) return null
  const [partes, contas] = await Promise.all([
    supabase.from('financeiro_partes').select('id').ilike('nome', `%${texto}%`).limit(200),
    supabase.from('financeiro_contas').select('id').or(`nome.ilike.%${texto}%,codigo.ilike.%${texto}%`).limit(200),
  ])
  const condicoes = [`descricao.ilike.%${texto}%`]
  const idsPartes = (partes.data || []).map((x: any) => x.id)
  const idsContas = (contas.data || []).map((x: any) => x.id)
  if (idsPartes.length) condicoes.push(`parte_id.in.(${idsPartes.join(',')})`)
  if (idsContas.length) condicoes.push(`conta_id.in.(${idsContas.join(',')})`)
  return condicoes.join(',')
}

function aplicarFiltros(query: any, f: FiltrosDespesas, expressao: string | null): any {
  const hoje = hojeISO()
  switch (f.status) {
    case 'atrasadas':
      query = query.eq('status', 'aberto').lt('data_vencimento', hoje)
      break
    case 'vence7':
      query = query.eq('status', 'aberto').gte('data_vencimento', hoje).lte('data_vencimento', somarDias(hoje, 7))
      break
    case 'aberto':
      query = query.eq('status', 'aberto')
      break
    case 'pagas':
      query = query.eq('status', 'pago')
      break
    case 'canceladas':
      query = query.eq('status', 'cancelado')
      break
    case 'todas':
      query = query.in('status', ['aberto', 'pago'])
      break
  }
  if (f.parteId) query = query.eq('parte_id', f.parteId)
  if (f.etiqueta === 'sem_etiqueta') query = query.is('etiqueta_aprovacao', null)
  else if (f.etiqueta !== 'todas') query = query.eq('etiqueta_aprovacao', f.etiqueta)
  if (f.de) query = query.gte('data_vencimento', f.de)
  if (f.ate) query = query.lte('data_vencimento', f.ate)
  if (expressao) query = query.or(expressao)
  return query
}

/** `id` por último em toda ordenação: desempate estável, senão linhas com a mesma data repetem/somem entre páginas. */
function ordenar(query: any, status: StatusLista): any {
  switch (status) {
    case 'pagas':
      return query.order('data_pagamento', { ascending: false, nullsFirst: false }).order('id')
    case 'canceladas':
      return query.order('updated_at', { ascending: false }).order('id')
    case 'todas':
      return query.order('data_vencimento', { ascending: false }).order('id')
    default:
      return query.order('data_vencimento').order('id')
  }
}

const TAMANHO_BLOCO = 1000 // máximo que o PostgREST devolve por requisição

/** Conjuntos de carga completa: percorre todas as páginas de 1000. */
export async function buscarTodos(f: FiltrosDespesas): Promise<FinanceiroLancamento[]> {
  const expressao = await expressaoBusca(f.q)
  const linhas: FinanceiroLancamento[] = []
  let inicio = 0
  while (true) {
    const consulta = ordenar(aplicarFiltros(supabase.from('financeiro_lancamentos').select(SELECT_LISTA), f, expressao), f.status)
    const { data, error } = await consulta.range(inicio, inicio + TAMANHO_BLOCO - 1)
    if (error) throw error
    linhas.push(...((data || []) as FinanceiroLancamento[]))
    if (!data || data.length < TAMANHO_BLOCO) break
    inicio += TAMANHO_BLOCO
  }
  return linhas
}

/** Histórico paginado: devolve a fatia pedida e o total (contagem exata) do filtro. */
export async function buscarPagina(
  f: FiltrosDespesas,
  inicio: number,
  quantidade: number
): Promise<{ linhas: FinanceiroLancamento[]; total: number }> {
  const expressao = await expressaoBusca(f.q)
  const consulta = ordenar(
    aplicarFiltros(supabase.from('financeiro_lancamentos').select(SELECT_LISTA, { count: 'exact' }), f, expressao),
    f.status
  )
  const { data, error, count } = await consulta.range(inicio, inicio + quantidade - 1)
  if (error) throw error
  return { linhas: (data || []) as FinanceiroLancamento[], total: count ?? (data || []).length }
}

export interface ResumoStatus {
  quantidade: number
  total: number
}
export type ResumoDespesas = Record<'aberto' | 'pago' | 'cancelado', ResumoStatus>

export function resumir(linhas: { status: string; valor_total: number }[]): ResumoDespesas {
  const resumo: ResumoDespesas = {
    aberto: { quantidade: 0, total: 0 },
    pago: { quantidade: 0, total: 0 },
    cancelado: { quantidade: 0, total: 0 },
  }
  for (const l of linhas) {
    const alvo = resumo[l.status as keyof ResumoDespesas]
    if (!alvo) continue
    alvo.quantidade += 1
    alvo.total += l.valor_total || 0
  }
  return resumo
}

/** Totais do filtro inteiro (não só da página carregada): consulta leve, só status + valor. */
export async function buscarResumo(f: FiltrosDespesas): Promise<ResumoDespesas> {
  const expressao = await expressaoBusca(f.q)
  const linhas: { status: string; valor_total: number }[] = []
  let inicio = 0
  while (true) {
    const consulta = aplicarFiltros(supabase.from('financeiro_lancamentos').select('id, status, valor_total'), f, expressao)
    const { data, error } = await consulta.order('id').range(inicio, inicio + TAMANHO_BLOCO - 1)
    if (error) throw error
    linhas.push(...((data || []) as any[]))
    if (!data || data.length < TAMANHO_BLOCO) break
    inicio += TAMANHO_BLOCO
  }
  return resumir(linhas)
}
