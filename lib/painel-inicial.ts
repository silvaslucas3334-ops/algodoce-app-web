import { supabase } from './supabase'
import { getHoje, isAtrasada } from './tarefas-utils'

export interface ItemVencendo {
  produtoId: string
  produtoNome: string
  quantidade: number
  unidadeMedida: string
}

export interface ColaboradorAtrasado {
  usuarioId: string
  nome: string
  quantidade: number
}

export interface OrdemCancelada {
  produtoNome: string
  motivo: string | null
  canceladaEm: string
}

export interface PainelResumo {
  venceHoje: { total: number; itens: ItemVencendo[] }
  vencidos: { total: number; itens: ItemVencendo[] }
  tarefasAtrasadas: { porColaborador: ColaboradorAtrasado[] }
  ordensCanceladas: { total: number; itens: OrdemCancelada[] }
  romaneioPendenteRecebimento: number
  ordensAguardandoInicio: number
  ordensEmProducao: number
  romaneioCriadoParaEnvio: number
}

// "Total" aqui é a contagem de PRODUTOS distintos vencendo/vencidos (o que o
// card mostra: "Pão de queijo · Brigadeiro · +3 itens"), não a contagem de
// lotes/etiquetas — um mesmo produto pode ter várias etiquetas com a mesma
// data de validade, e isso deve virar 1 linha só somando a quantidade.
// `esgotado` já significa "saiu do estoque" (venda ou consumo) — não é mais
// um risco, então entra como exclusão em ambas as buscas (vence hoje e
// vencidos), o que corrige um gap da versão anterior do painel (que só
// aplicava esse filtro na leitura de 7 dias, não separava vencidos).
async function buscarItensVencimento(
  escopo: (query: any) => any,
  comparacao: 'eq' | 'lt',
  hoje: string
): Promise<{ total: number; itens: ItemVencendo[] }> {
  let query = supabase
    .from('lotes_producao')
    .select('produto_id, quantidade, produto:produtos(nome, unidade_medida)')
    .neq('status', 'esgotado')
  query = escopo(query)
  query = comparacao === 'eq' ? query.eq('data_validade', hoje) : query.lt('data_validade', hoje)

  const { data } = await query

  const porProduto = new Map<string, ItemVencendo>()
  ;(data || []).forEach((l: any) => {
    const existente = porProduto.get(l.produto_id)
    if (existente) {
      existente.quantidade += l.quantidade || 0
    } else {
      porProduto.set(l.produto_id, {
        produtoId: l.produto_id,
        produtoNome: l.produto?.nome || 'Desconhecido',
        quantidade: l.quantidade || 0,
        unidadeMedida: l.produto?.unidade_medida || 'Unidade',
      })
    }
  })

  const itens = Array.from(porProduto.values()).sort((a, b) => b.quantidade - a.quantidade)
  return { total: itens.length, itens }
}

// Pré-filtro grosso no banco (data_vencimento <= hoje, status ainda aberto)
// + refino client-side com isAtrasada() — só ela sabe comparar hora_limite
// no fuso de São Paulo corretamente (ver lib/tarefas-utils.ts).
async function buscarTarefasAtrasadasPorColaborador(setorId: string, hoje: string): Promise<ColaboradorAtrasado[]> {
  const { data } = await supabase
    .from('tarefas')
    .select('responsavel_atual_id, data_vencimento, hora_limite, status')
    .eq('setor_id', setorId)
    .lte('data_vencimento', hoje)
    .in('status', ['pendente', 'pronta_revisao', 'refazer_pendente'])

  const atrasadas = (data || []).filter((t: any) => isAtrasada(t.data_vencimento, t.hora_limite, t.status))
  if (atrasadas.length === 0) return []

  const idsColaboradores = Array.from(new Set(atrasadas.map((t: any) => t.responsavel_atual_id)))
  const { data: usuariosData } = await supabase.from('usuarios').select('id, nome').in('id', idsColaboradores)
  const nomePorId = new Map((usuariosData || []).map((u: any) => [u.id, u.nome]))

  const contagem = new Map<string, number>()
  atrasadas.forEach((t: any) => {
    contagem.set(t.responsavel_atual_id, (contagem.get(t.responsavel_atual_id) || 0) + 1)
  })

  return Array.from(contagem.entries())
    .map(([usuarioId, quantidade]) => ({ usuarioId, nome: nomePorId.get(usuarioId) || 'Desconhecido', quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
}

async function buscarOrdensCanceladas(escopo: (query: any) => any): Promise<{ total: number; itens: OrdemCancelada[] }> {
  const [{ count }, { data }] = await Promise.all([
    escopo(supabase.from('ordens_producao').select('id', { count: 'exact', head: true }).eq('status', 'cancelada')),
    escopo(
      supabase
        .from('ordens_producao')
        .select('motivo_cancelamento, updated_at, produto:produtos(nome)')
        .eq('status', 'cancelada')
        .order('updated_at', { ascending: false })
        .limit(5)
    ),
  ])

  return {
    total: count || 0,
    itens: (data || []).map((o: any) => ({
      produtoNome: o.produto?.nome || 'Desconhecido',
      motivo: o.motivo_cancelamento,
      canceladaEm: o.updated_at,
    })),
  }
}

async function contarOrdens(escopo: (query: any) => any, status: string): Promise<number> {
  const { count } = await escopo(
    supabase.from('ordens_producao').select('id', { count: 'exact', head: true }).eq('status', status)
  )
  return count || 0
}

// "Criado para envio" da loja precisa filtrar por criado_por (não só pela
// RLS): uma transferência criada pela loja1 com destino loja2 passa pela RLS
// de SELECT da loja2 (ela é a unidade_destino), então contaria errado se a
// query não restringir explicitamente aos usuários da própria loja.
async function buscarIdsUsuariosDaLoja(lojaId: string): Promise<string[]> {
  const { data } = await supabase.from('usuarios').select('id').eq('loja_id', lojaId)
  return (data || []).map((u: any) => u.id)
}

export async function buscarResumoPainelLoja(lojaId: string, setorId: string): Promise<PainelResumo> {
  const hoje = getHoje()
  const escopoLotes = (q: any) => q.eq('destino', lojaId)
  const escopoOrdens = (q: any) => q.eq('loja_destino', lojaId)

  const [venceHoje, vencidos, porColaborador, ordensCanceladas, idsUsuariosDaLoja] = await Promise.all([
    buscarItensVencimento(escopoLotes, 'eq', hoje),
    buscarItensVencimento(escopoLotes, 'lt', hoje),
    buscarTarefasAtrasadasPorColaborador(setorId, hoje),
    buscarOrdensCanceladas(escopoOrdens),
    buscarIdsUsuariosDaLoja(lojaId),
  ])

  const [romaneioPendenteRecebimento, romaneioCriadoParaEnvio, ordensAguardandoInicio, ordensEmProducao] = await Promise.all([
    supabase
      .from('romaneios')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'confirmado')
      .eq('unidade_destino', lojaId)
      .then((r) => r.count || 0),
    idsUsuariosDaLoja.length === 0
      ? Promise.resolve(0)
      : supabase
          .from('romaneios')
          .select('id', { count: 'exact', head: true })
          .eq('tipo', 'transferencia')
          .eq('status', 'rascunho')
          .in('criado_por', idsUsuariosDaLoja)
          .then((r) => r.count || 0),
    contarOrdens(escopoOrdens, 'pendente'),
    contarOrdens(escopoOrdens, 'em_producao'),
  ])

  return {
    venceHoje,
    vencidos,
    tarefasAtrasadas: { porColaborador },
    ordensCanceladas,
    romaneioPendenteRecebimento,
    romaneioCriadoParaEnvio,
    ordensAguardandoInicio,
    ordensEmProducao,
  }
}

export async function buscarResumoPainelCozinha(setorId: string): Promise<PainelResumo> {
  const hoje = getHoje()
  const escopoLotes = (q: any) => q.eq('status', 'na_cozinha')
  const escopoOrdens = (q: any) => q // cozinha produz pra todas as lojas + internas, sem filtro

  const [venceHoje, vencidos, porColaborador, ordensCanceladas] = await Promise.all([
    buscarItensVencimento(escopoLotes, 'eq', hoje),
    buscarItensVencimento(escopoLotes, 'lt', hoje),
    buscarTarefasAtrasadasPorColaborador(setorId, hoje),
    buscarOrdensCanceladas(escopoOrdens),
  ])

  const [romaneioPendenteRecebimento, romaneioCriadoParaEnvio, ordensAguardandoInicio, ordensEmProducao] = await Promise.all([
    supabase
      .from('romaneios')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'transferencia')
      .eq('status', 'confirmado')
      .eq('unidade_destino', 'cozinha')
      .then((r) => r.count || 0),
    supabase
      .from('romaneios')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'envio')
      .eq('status', 'rascunho')
      .then((r) => r.count || 0),
    contarOrdens(escopoOrdens, 'pendente'),
    contarOrdens(escopoOrdens, 'em_producao'),
  ])

  return {
    venceHoje,
    vencidos,
    tarefasAtrasadas: { porColaborador },
    ordensCanceladas,
    romaneioPendenteRecebimento,
    romaneioCriadoParaEnvio,
    ordensAguardandoInicio,
    ordensEmProducao,
  }
}
