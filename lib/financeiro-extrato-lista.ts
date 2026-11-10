import { supabase } from './supabase'
import { CATEGORIA_RECEITA_LABEL } from './constants'
import { FinanceiroExtratoTransacao, StatusConciliacao } from './types'

// Fase 1 da conciliação de extrato — consultas da LISTA: paginação com contagem exata (o PostgREST corta em
// 1.000 linhas em silêncio; a aba "Conciliado" tem milhares), resumo das pendências, contagem por status,
// última importação por loja e "a que ficou ligada" cada transação conciliada.

export type FiltroLoja = 'todas' | 'loja1' | 'loja2'
export type FiltroTipo = 'todos' | 'entradas' | 'saidas'

export interface FiltrosExtrato {
  status: StatusConciliacao
  loja: FiltroLoja
  tipo: FiltroTipo
  q: string
}

export const TAMANHO_PAGINA = 100

/** Texto livre → número em formato brasileiro ("1.234,56" ou "70") ou null. */
export function valorDaBusca(q: string): number | null {
  const limpo = q.trim().replace(/^r\$\s*/i, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null
  const n = limpo.includes(',') ? Number(limpo.replace(/\./g, '').replace(',', '.')) : Number(limpo.replace(/\.(?=\d{3}\b)/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

// Caracteres que quebrariam a sintaxe de `.or()` do PostgREST.
const semSintaxe = (s: string) => s.replace(/[,()"\\*%]/g, ' ').replace(/\s+/g, ' ').trim()

function aplicarFiltros(query: any, f: FiltrosExtrato) {
  query = query.eq('status_conciliacao', f.status)
  if (f.loja !== 'todas') query = query.eq('conta_bancaria', f.loja)
  if (f.tipo === 'entradas') query = query.gt('valor', 0)
  if (f.tipo === 'saidas') query = query.lt('valor', 0)
  const bruto = f.q.trim()
  if (bruto) {
    const valor = valorDaBusca(bruto)
    const soNumeros = /^[\d.,\s\-/]+$/.test(bruto)
    const digitos = bruto.replace(/\D/g, '')
    const palavras = semSintaxe(bruto).split(' ').filter(Boolean)
    if (!soNumeros && palavras.length > 1) {
      // várias palavras ("padaria tropical"): todas precisam aparecer na descrição, em qualquer ordem
      palavras.forEach((p) => {
        query = query.ilike('descricao_original', `%${p}%`)
      })
    } else {
      let partes: string[]
      if (soNumeros && valor !== null && digitos.length <= 7) {
        // "70" ou "70,00": quem digita um número curto quer o VALOR (casar com a descrição traria centenas de linhas)
        partes = [`valor.eq.${valor}`, `valor.eq.-${valor}`]
      } else {
        partes = [`descricao_original.ilike.%${semSintaxe(bruto)}%`]
        // CPF/CNPJ só quando a busca é feita de números/pontuação (senão "padaria 7" casaria qualquer documento com 7)
        if (soNumeros && digitos.length >= 3) partes.push(`documento_extraido.ilike.%${digitos}%`)
        if (valor !== null) partes.push(`valor.eq.${valor}`, `valor.eq.-${valor}`)
      }
      query = query.or(partes.join(','))
    }
  }
  return query
}

export interface PaginaExtrato {
  linhas: FinanceiroExtratoTransacao[]
  total: number
}

/** Uma fatia da lista (mais recentes primeiro) + o total exato com os mesmos filtros. */
export async function buscarPaginaExtrato(f: FiltrosExtrato, deslocamento: number, limite: number): Promise<PaginaExtrato> {
  const query = aplicarFiltros(supabase.from('financeiro_extrato_transacoes').select('*', { count: 'exact' }), f)
    .order('data', { ascending: false })
    .order('id', { ascending: false }) // desempate estável: muitas linhas têm a mesma data
    .range(deslocamento, deslocamento + limite - 1)
  const { data, error, count } = await query
  if (error) throw new Error(error.message)
  return { linhas: (data || []) as FinanceiroExtratoTransacao[], total: count ?? (data || []).length }
}

export type ContagemStatus = Record<StatusConciliacao, number>

/** Quantas transações há em cada status (respeitando o filtro de loja), para os rótulos das abas. */
export async function buscarContagensStatus(loja: FiltroLoja): Promise<ContagemStatus> {
  const estados: StatusConciliacao[] = ['pendente', 'conciliado', 'ignorado']
  const resultados = await Promise.all(
    estados.map(async (s) => {
      let q = supabase.from('financeiro_extrato_transacoes').select('id', { count: 'exact', head: true }).eq('status_conciliacao', s)
      if (loja !== 'todas') q = q.eq('conta_bancaria', loja)
      const { count, error } = await q
      if (error) throw new Error(error.message)
      return count || 0
    })
  )
  return { pendente: resultados[0], conciliado: resultados[1], ignorado: resultados[2] }
}

export interface ResumoPendencias {
  total: number
  entradas: { n: number; valor: number }
  saidas: { n: number; valor: number }
  porLoja: Record<'loja1' | 'loja2', number>
  /** data (YYYY-MM-DD) da pendência mais antiga, ou null */
  maisAntiga: string | null
}

/** Resumo de TODAS as pendências (independe dos filtros e da paginação da lista). */
export async function buscarResumoPendencias(): Promise<ResumoPendencias> {
  const resumo: ResumoPendencias = {
    total: 0,
    entradas: { n: 0, valor: 0 },
    saidas: { n: 0, valor: 0 },
    porLoja: { loja1: 0, loja2: 0 },
    maisAntiga: null,
  }
  for (let deslocamento = 0; ; deslocamento += 1000) {
    const { data, error } = await supabase
      .from('financeiro_extrato_transacoes')
      .select('data, valor, conta_bancaria')
      .eq('status_conciliacao', 'pendente')
      .order('id')
      .range(deslocamento, deslocamento + 999)
    if (error) throw new Error(error.message)
    for (const t of data || []) {
      resumo.total++
      const v = Number(t.valor)
      if (v >= 0) {
        resumo.entradas.n++
        resumo.entradas.valor += v
      } else {
        resumo.saidas.n++
        resumo.saidas.valor += Math.abs(v)
      }
      const conta = t.conta_bancaria as string
      if (conta === 'loja1' || conta === 'loja2') resumo.porLoja[conta]++
      if (!resumo.maisAntiga || t.data < resumo.maisAntiga) resumo.maisAntiga = t.data
    }
    if (!data || data.length < 1000) break
  }
  resumo.entradas.valor = Math.round(resumo.entradas.valor * 100) / 100
  resumo.saidas.valor = Math.round(resumo.saidas.valor * 100) / 100
  return resumo
}

export interface UltimaImportacao {
  importadoEm: string
  /** data da transação mais recente já importada para a loja */
  ateData: string
}

/** Por loja: quando foi a última importação e até que data o extrato já está importado. */
export async function buscarUltimasImportacoes(): Promise<Record<'loja1' | 'loja2', UltimaImportacao | null>> {
  const lojas = ['loja1', 'loja2'] as const
  const [ultimas, maisRecentes] = await Promise.all([
    Promise.all(
      lojas.map(async (l) => {
        const { data, error } = await supabase
          .from('financeiro_extrato_transacoes')
          .select('importado_em')
          .eq('conta_bancaria', l)
          .order('importado_em', { ascending: false })
          .limit(1)
        if (error) throw new Error(error.message)
        return data?.[0]?.importado_em as string | undefined
      })
    ),
    Promise.all(
      lojas.map(async (l) => {
        const { data, error } = await supabase
          .from('financeiro_extrato_transacoes')
          .select('data')
          .eq('conta_bancaria', l)
          .order('data', { ascending: false })
          .limit(1)
        if (error) throw new Error(error.message)
        return data?.[0]?.data as string | undefined
      })
    ),
  ])
  const resultado = {} as Record<'loja1' | 'loja2', UltimaImportacao | null>
  lojas.forEach((l, i) => {
    resultado[l] = ultimas[i] && maisRecentes[i] ? { importadoEm: ultimas[i]!, ateData: maisRecentes[i]! } : null
  })
  return resultado
}

// --- a que ficou ligada cada transação conciliada ------------------------------------------------------------

export interface VinculoExtrato {
  tipo: 'despesa' | 'receita' | 'varias'
  rotulo: string
  /** página da despesa, quando há exatamente uma */
  href?: string
}

const blocos = <T,>(lista: T[], tamanho = 100) => {
  const r: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho))
  return r
}

/**
 * Para as transações conciliadas da página, descobre o que cada uma pagou/classificou: despesa(s) (vínculo
 * direto, em grupo ou parcial) ou categoria de receita. Sem isto a aba "Conciliado" era uma lista muda.
 */
export async function buscarVinculosDasTransacoes(linhas: FinanceiroExtratoTransacao[]): Promise<Map<string, VinculoExtrato>> {
  const mapa = new Map<string, VinculoExtrato>()
  const conciliadas = linhas.filter((t) => t.status_conciliacao === 'conciliado')
  if (conciliadas.length === 0) return mapa

  const ids = conciliadas.map((t) => t.id)
  const lancIdsDiretos = Array.from(new Set(conciliadas.map((t) => t.lancamento_id).filter((x): x is string => !!x)))

  type Lanc = { id: string; descricao: string; extrato_transacao_id: string | null; parte: { nome: string } | { nome: string }[] | null }
  const SELECT_LANC = 'id, descricao, extrato_transacao_id, parte:financeiro_partes!parte_id(nome)'

  const [receitas, lancPorExtrato, lancPorId] = await Promise.all([
    Promise.all(
      blocos(ids).map(async (b) => {
        const { data, error } = await supabase.from('financeiro_receitas').select('extrato_transacao_id, categoria').in('extrato_transacao_id', b)
        if (error) throw new Error(error.message)
        return (data || []) as { extrato_transacao_id: string; categoria: string }[]
      })
    ),
    Promise.all(
      blocos(ids).map(async (b) => {
        const { data, error } = await supabase.from('financeiro_lancamentos').select(SELECT_LANC).in('extrato_transacao_id', b)
        if (error) throw new Error(error.message)
        return (data || []) as unknown as Lanc[]
      })
    ),
    Promise.all(
      blocos(lancIdsDiretos).map(async (b) => {
        const { data, error } = await supabase.from('financeiro_lancamentos').select(SELECT_LANC).in('id', b)
        if (error) throw new Error(error.message)
        return (data || []) as unknown as Lanc[]
      })
    ),
  ])

  const nomeParte = (l: Lanc) => (Array.isArray(l.parte) ? l.parte[0]?.nome : l.parte?.nome) || '—'
  const lancPorTx = new Map<string, Lanc[]>()
  const adicionar = (txId: string | null, l: Lanc) => {
    if (!txId) return
    const lista = lancPorTx.get(txId) || []
    if (!lista.some((x) => x.id === l.id)) lista.push(l)
    lancPorTx.set(txId, lista)
  }
  lancPorExtrato.flat().forEach((l) => adicionar(l.extrato_transacao_id, l))
  const lancPorIdMapa = new Map(lancPorId.flat().map((l) => [l.id, l]))
  conciliadas.forEach((t) => {
    if (t.lancamento_id && lancPorIdMapa.has(t.lancamento_id)) adicionar(t.id, lancPorIdMapa.get(t.lancamento_id)!)
  })

  const receitaPorTx = new Map(receitas.flat().map((r) => [r.extrato_transacao_id, r.categoria]))

  conciliadas.forEach((t) => {
    const cat = receitaPorTx.get(t.id)
    if (cat) {
      mapa.set(t.id, { tipo: 'receita', rotulo: CATEGORIA_RECEITA_LABEL[cat] || cat })
      return
    }
    const lancs = lancPorTx.get(t.id) || []
    if (lancs.length === 1) {
      mapa.set(t.id, { tipo: 'despesa', rotulo: `${nomeParte(lancs[0])} · ${lancs[0].descricao}`, href: `/financeiro/despesas/${lancs[0].id}` })
    } else if (lancs.length > 1) {
      mapa.set(t.id, { tipo: 'varias', rotulo: `${lancs.length} despesas` })
    }
  })
  return mapa
}
