import { supabase } from './supabase'
import { hojeISO, somarDias } from './financeiro-utils'

// Posição de Estoque (admin, desktop): grade produto × unidade (Cozinha | Paraisópolis | Itajubá |
// Total) + "a caminho", sobre a view estoque_posicao (lib/migrations/estoque-fase8a-posicao.sql).
// Regras: cozinha = etiqueta na_cozinha; loja = etiqueta na_loja (pelo destino); "a caminho" =
// etiqueta enviada que ainda não recebeu entrada — NUNCA entra no disponível da loja.

export type UnidadeEstoque = 'cozinha' | 'loja1' | 'loja2'
export const UNIDADES_ESTOQUE: UnidadeEstoque[] = ['cozinha', 'loja1', 'loja2']

export interface LinhaPosicao {
  produto_id: string
  produto_nome: string
  categoria_id: string | null
  categoria_nome: string
  unidade_medida: string | null
  unidade: UnidadeEstoque
  situacao: 'disponivel' | 'a_caminho'
  etiquetas: number
  quantidade: number
  proxima_validade: string | null
  vencidas: number
  vence_7d: number
}

export interface Celula {
  etiquetas: number
  quantidade: number
  proxima: string | null
  vencidas: number
  vence7d: number
}

export interface ProdutoPosicao {
  produtoId: string
  nome: string
  categoria: string
  unidadeMedida: string
  cozinha: Celula
  loja1: Celula
  loja2: Celula
  total: Celula
  aCaminho: Celula
}

export interface ProdutoCadastro {
  id: string
  nome: string
  unidade_medida: string | null
  categoria: string
}

export type FiltroRapido = 'todos' | 'vence7' | 'vencidos' | 'a_caminho' | 'sem_estoque'
export type ColunaOrdem = 'nome' | 'cozinha' | 'loja1' | 'loja2' | 'total' | 'aCaminho' | 'validade' | 'vencidas'

export interface FiltrosPosicao {
  q: string
  categoria: string // nome da categoria ('' = todas)
  unidade: '' | UnidadeEstoque
  rapido: FiltroRapido
  ordem: ColunaOrdem
  desc: boolean
}

const vazia = (): Celula => ({ etiquetas: 0, quantidade: 0, proxima: null, vencidas: 0, vence7d: 0 })

function somar(alvo: Celula, l: Pick<LinhaPosicao, 'etiquetas' | 'quantidade' | 'proxima_validade' | 'vencidas' | 'vence_7d'>) {
  alvo.etiquetas += l.etiquetas
  alvo.quantidade += Number(l.quantidade) || 0
  alvo.vencidas += l.vencidas
  alvo.vence7d += l.vence_7d
  if (l.proxima_validade && (!alvo.proxima || l.proxima_validade < alvo.proxima)) alvo.proxima = l.proxima_validade
}

const TAMANHO_BLOCO = 1000

export async function buscarPosicao(): Promise<LinhaPosicao[]> {
  const linhas: LinhaPosicao[] = []
  let inicio = 0
  while (true) {
    const { data, error } = await supabase
      .from('estoque_posicao')
      .select('*')
      .order('produto_nome')
      .order('unidade')
      .order('situacao')
      .range(inicio, inicio + TAMANHO_BLOCO - 1)
    if (error) throw error
    linhas.push(...((data || []) as LinhaPosicao[]))
    if (!data || data.length < TAMANHO_BLOCO) break
    inicio += TAMANHO_BLOCO
  }
  return linhas
}

export async function buscarProdutosAtivos(): Promise<ProdutoCadastro[]> {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, unidade_medida, categoria:categorias(nome)')
    .eq('ativo', true)
    .order('nome')
    .range(0, 4999)
  if (error) throw error
  return ((data || []) as any[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    unidade_medida: p.unidade_medida,
    categoria: (Array.isArray(p.categoria) ? p.categoria[0]?.nome : p.categoria?.nome) || 'Sem categoria',
  }))
}

/** Pivô: uma linha por produto, com as colunas de cada unidade. Produtos sem estoque entram zerados. */
export function montarGrade(linhas: LinhaPosicao[], produtos: ProdutoCadastro[]): ProdutoPosicao[] {
  const mapa = new Map<string, ProdutoPosicao>()
  const garantir = (id: string, nome: string, categoria: string, unidadeMedida: string | null) => {
    let p = mapa.get(id)
    if (!p) {
      p = { produtoId: id, nome, categoria, unidadeMedida: unidadeMedida || 'Unidade', cozinha: vazia(), loja1: vazia(), loja2: vazia(), total: vazia(), aCaminho: vazia() }
      mapa.set(id, p)
    }
    return p
  }
  produtos.forEach((pr) => garantir(pr.id, pr.nome, pr.categoria, pr.unidade_medida))
  linhas.forEach((l) => {
    const p = garantir(l.produto_id, l.produto_nome, l.categoria_nome, l.unidade_medida)
    if (l.situacao === 'a_caminho') {
      somar(p.aCaminho, l)
    } else {
      somar(p[l.unidade], l)
      somar(p.total, l)
    }
  })
  return Array.from(mapa.values())
}

const celulaDaUnidade = (p: ProdutoPosicao, u: '' | UnidadeEstoque): Celula => (u ? p[u] : p.total)

export function filtrarGrade(grade: ProdutoPosicao[], f: FiltrosPosicao): ProdutoPosicao[] {
  const texto = f.q.trim().toLowerCase()
  return grade.filter((p) => {
    if (texto && !p.nome.toLowerCase().includes(texto)) return false
    if (f.categoria && p.categoria !== f.categoria) return false
    const c = celulaDaUnidade(p, f.unidade)
    switch (f.rapido) {
      case 'sem_estoque':
        return c.etiquetas === 0 && p.aCaminho.etiquetas === 0
      case 'vence7':
        return c.vence7d > 0
      case 'vencidos':
        return c.vencidas > 0
      case 'a_caminho':
        return p.aCaminho.etiquetas > 0
      default:
        // sem filtro rápido: produtos sem nenhuma etiqueta ficam escondidos (use "Sem estoque" p/ vê-los),
        // exceto quando o usuário está buscando um produto pelo nome
        return c.etiquetas > 0 || p.aCaminho.etiquetas > 0 || !!texto
    }
  })
}

export function ordenarGrade(grade: ProdutoPosicao[], ordem: ColunaOrdem, desc: boolean): ProdutoPosicao[] {
  const valor = (p: ProdutoPosicao): number | string => {
    switch (ordem) {
      case 'cozinha': return p.cozinha.etiquetas
      case 'loja1': return p.loja1.etiquetas
      case 'loja2': return p.loja2.etiquetas
      case 'total': return p.total.etiquetas
      case 'aCaminho': return p.aCaminho.etiquetas
      case 'vencidas': return p.total.vencidas
      case 'validade': return p.total.proxima || '9999-12-31' // sem estoque vai pro fim
      default: return p.nome.toLowerCase()
    }
  }
  const lista = [...grade].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return cmp !== 0 ? cmp : a.nome.localeCompare(b.nome)
  })
  return desc ? lista.reverse() : lista
}

export interface ResumoPosicao {
  etiquetas: number
  produtosComEstoque: number
  vence7d: number
  vencidas: number
  aCaminho: number
}

export function resumirGrade(grade: ProdutoPosicao[]): ResumoPosicao {
  const r: ResumoPosicao = { etiquetas: 0, produtosComEstoque: 0, vence7d: 0, vencidas: 0, aCaminho: 0 }
  grade.forEach((p) => {
    r.etiquetas += p.total.etiquetas
    if (p.total.etiquetas > 0) r.produtosComEstoque += 1
    r.vence7d += p.total.vence7d
    r.vencidas += p.total.vencidas
    r.aCaminho += p.aCaminho.etiquetas
  })
  return r
}

export const CABECALHO_CSV = ['produto', 'categoria', 'unidade_medida', 'cozinha', 'paraisopolis', 'itajuba', 'total', 'quantidade_total', 'a_caminho', 'proxima_validade', 'vencidas', 'vence_em_7_dias']

export function linhasCsv(grade: ProdutoPosicao[]) {
  return grade.map((p) => ({
    produto: p.nome,
    categoria: p.categoria,
    unidade_medida: p.unidadeMedida,
    cozinha: p.cozinha.etiquetas,
    paraisopolis: p.loja1.etiquetas,
    itajuba: p.loja2.etiquetas,
    total: p.total.etiquetas,
    quantidade_total: p.total.quantidade,
    a_caminho: p.aCaminho.etiquetas,
    proxima_validade: p.total.proxima || '',
    vencidas: p.total.vencidas,
    vence_em_7_dias: p.total.vence7d,
  }))
}

export interface EtiquetaEstoque {
  id: string
  codigo_qr: string
  status: 'na_cozinha' | 'na_loja' | 'enviado'
  destino: string | null
  quantidade: number | null
  peso_gramas: number | null
  data_validade: string
  data_producao: string | null
}

/** Etiquetas de UM produto que estão em estoque ou a caminho (carregadas só ao abrir a linha). */
export async function buscarEtiquetasDoProduto(produtoId: string): Promise<EtiquetaEstoque[]> {
  const { data, error } = await supabase
    .from('lotes_producao')
    .select('id, codigo_qr, status, destino, quantidade, peso_gramas, data_validade, data_producao')
    .eq('produto_id', produtoId)
    .in('status', ['na_cozinha', 'na_loja', 'enviado'])
    .order('data_validade')
    .order('id')
    .range(0, 999)
  if (error) throw error
  return (data || []) as EtiquetaEstoque[]
}

/** Cor da validade: vencida (vermelho), até 7 dias (laranja), ok (cinza). */
export function classeValidade(validade: string | null): string {
  if (!validade) return 'text-gray-400'
  const hoje = hojeISO()
  if (validade < hoje) return 'text-red-600 font-semibold'
  if (validade <= somarDias(hoje, 7)) return 'text-orange-600 font-semibold'
  return 'text-gray-600'
}
