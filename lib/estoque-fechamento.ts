import { supabase } from './supabase'
import { baixarPorQuantidade, MotivoBaixa } from './estoque-baixa'

// Fechamento do dia = inventário diário da loja. A funcionária conta o que há na
// prateleira, produto a produto; a diferença para o sistema vira baixa (FEFO, com
// motivo). Se o bloqueio estiver ligado (estoque_config), o sistema todo fica
// travado depois da hora de corte até o fechamento ser feito.

export interface StatusFechamento {
  pendente: boolean
  bloqueio_ativo: boolean
  data_exigida?: string
  hora_corte?: string
}

/**
 * Pergunta ao banco (relógio do servidor, fuso de São Paulo) se o fechamento está
 * pendente. Devolve null em caso de erro — quem chama NÃO deve bloquear nesse caso:
 * a loja só trava por regra, nunca por defeito (internet, SQL ainda não rodado...).
 */
export async function buscarStatusFechamento(local: string): Promise<StatusFechamento | null> {
  const { data, error } = await supabase.rpc('estoque_fechamento_status', { p_local: local })
  if (error || !data) {
    if (error) console.warn('Status do fechamento indisponível (não bloqueia):', error.message)
    return null
  }
  return data as StatusFechamento
}

export interface LinhaContagem {
  produtoId: string
  nome: string
  categoria: string
  unidadeMedida: string
  esperado: number // etiquetas na prateleira (cada etiqueta = 1 unidade)
}

/** O que o sistema acha que há na prateleira da loja, agrupado por produto. */
export async function carregarContagem(local: string): Promise<LinhaContagem[]> {
  const linhas: any[] = []
  let inicio = 0
  while (true) {
    const { data, error } = await supabase
      .from('lotes_producao')
      .select('id, produto_id, produto:produtos(nome, unidade_medida, categoria:categorias(nome))')
      .eq('destino', local)
      .eq('status', 'na_loja')
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw error
    linhas.push(...(data || []))
    if (!data || data.length < 1000) break
    inicio += 1000
  }

  const porProduto = new Map<string, LinhaContagem>()
  for (const l of linhas) {
    const produto = Array.isArray(l.produto) ? l.produto[0] : l.produto
    const categoria = Array.isArray(produto?.categoria) ? produto.categoria[0] : produto?.categoria
    const atual = porProduto.get(l.produto_id)
    if (atual) atual.esperado += 1
    else {
      porProduto.set(l.produto_id, {
        produtoId: l.produto_id,
        nome: produto?.nome || 'Produto',
        categoria: categoria?.nome || 'Sem categoria',
        unidadeMedida: produto?.unidade_medida || 'Unidade',
        esperado: 1,
      })
    }
  }
  return Array.from(porProduto.values()).sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nome.localeCompare(b.nome))
}

export interface ItemContado {
  produtoId: string
  esperado: number
  contado: number
  motivo: MotivoBaixa // usado quando contado < esperado
}

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

/**
 * Registra o fechamento: baixa a diferença (esperado − contado, das etiquetas que
 * vencem primeiro) e grava o fechamento com um item por produto.
 *
 * Ordem de propósito: BAIXAS primeiro, registro depois. As baixas são protegidas
 * contra repetição; se o registro falhar, repetir o fechamento enxerga diferença
 * zero e só registra. O contrário (registrar e falhar nas baixas) marcaria o dia
 * como fechado com o estoque errado.
 */
export async function registrarFechamento(params: {
  local: string
  usuarioId: string
  usuarioNome: string
  itens: ItemContado[]
}): Promise<{ fechamentoId: string; totalBaixado: number; avisos: string[] }> {
  const { local, usuarioId, usuarioNome, itens } = params
  const avisos: string[] = []
  const gravados: { produto_id: string; esperado: number; contado: number; baixado: number; excedente: number; motivo: string | null }[] = []
  let totalBaixado = 0

  for (const item of itens) {
    const falta = item.esperado - item.contado
    let baixado = 0
    if (falta > 0) {
      const r = await baixarPorQuantidade(item.produtoId, falta, { local, motivo: item.motivo, operador: usuarioNome })
      baixado = r.baixadas.length
      if (r.faltaram > 0) avisos.push(`Faltaram ${r.faltaram} etiqueta(s) para baixar (o estoque mudou durante a contagem).`)
    }
    totalBaixado += baixado
    gravados.push({
      produto_id: item.produtoId,
      esperado: item.esperado,
      contado: item.contado,
      baixado,
      excedente: Math.max(0, item.contado - item.esperado),
      motivo: falta > 0 ? item.motivo : null,
    })
  }

  const { data: fechamento, error } = await supabase
    .from('estoque_fechamentos')
    .insert({
      local,
      data: hojeSP(),
      criado_por: usuarioId,
      criado_por_nome: usuarioNome,
      total_itens: itens.length,
      total_baixado: totalBaixado,
    })
    .select('id')
    .single()
  if (error || !fechamento) throw error || new Error('Fechamento não registrado')

  if (gravados.length > 0) {
    const { error: erroItens } = await supabase
      .from('estoque_fechamento_itens')
      .insert(gravados.map((g) => ({ ...g, fechamento_id: fechamento.id })))
    if (erroItens) throw erroItens
  }
  return { fechamentoId: fechamento.id, totalBaixado, avisos }
}

/** Admin libera a loja de um fechamento (queda de energia, loja fechou, tablet com problema...). Fica registrado. */
export async function dispensarFechamento(params: { local: string; usuarioId: string; usuarioNome: string; motivo: string }) {
  const { error } = await supabase.from('estoque_fechamentos').insert({
    local: params.local,
    data: hojeSP(),
    criado_por: params.usuarioId,
    criado_por_nome: params.usuarioNome,
    dispensado: true,
    motivo_dispensa: params.motivo,
  })
  if (error) throw error
}
