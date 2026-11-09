import { supabase } from './supabase'
import type { UnidadeEstoque } from './estoque-posicao'

// Estoque mínimo por produto × unidade (Fase 8c; lib/migrations/estoque-fase8c-minimos.sql).
// Mínimo = etiquetas DISPONÍVEIS que o admin quer manter. Sem linha = sem mínimo (sem alerta).

export type MinimosDoProduto = Partial<Record<UnidadeEstoque, number>>
/** produto_id → mínimos definidos */
export type MapaMinimos = Map<string, MinimosDoProduto>

export async function buscarMinimos(): Promise<MapaMinimos> {
  const mapa: MapaMinimos = new Map()
  const { data, error } = await supabase.from('estoque_minimos').select('produto_id, unidade, minimo').range(0, 4999)
  if (error) {
    // tabela ainda não criada (SQL da 8c não aplicado) ou sem permissão: a grade segue sem mínimos
    console.error('Estoque mínimo indisponível:', error.message)
    return mapa
  }
  ;((data || []) as { produto_id: string; unidade: UnidadeEstoque; minimo: number }[]).forEach((m) => {
    const atual = mapa.get(m.produto_id) || {}
    atual[m.unidade] = m.minimo
    mapa.set(m.produto_id, atual)
  })
  return mapa
}

/** Grava os mínimos de um produto: número = define; null/vazio = remove (volta a "sem mínimo"). */
export async function salvarMinimos(produtoId: string, valores: Record<UnidadeEstoque, number | null>, usuarioId: string | null): Promise<void> {
  const definir = (Object.keys(valores) as UnidadeEstoque[])
    .filter((u) => valores[u] !== null && valores[u]! >= 0)
    .map((u) => ({ produto_id: produtoId, unidade: u, minimo: Math.floor(valores[u]!), atualizado_por: usuarioId, atualizado_em: new Date().toISOString() }))
  const remover = (Object.keys(valores) as UnidadeEstoque[]).filter((u) => valores[u] === null)

  if (definir.length > 0) {
    const { error } = await supabase.from('estoque_minimos').upsert(definir, { onConflict: 'produto_id,unidade' })
    if (error) throw error
  }
  if (remover.length > 0) {
    const { error } = await supabase.from('estoque_minimos').delete().eq('produto_id', produtoId).in('unidade', remover)
    if (error) throw error
  }
}

/** Quantos produtos estão abaixo do mínimo em alguma unidade (para o aviso do Início do admin). */
export async function contarProdutosAbaixoDoMinimo(): Promise<number> {
  const minimos = await buscarMinimos()
  if (minimos.size === 0) return 0
  const ids = Array.from(minimos.keys())
  const disponivel = new Map<string, Record<string, number>>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from('estoque_posicao')
      .select('produto_id, unidade, etiquetas')
      .eq('situacao', 'disponivel')
      .in('produto_id', ids.slice(i, i + 100))
    if (error) throw error
    ;((data || []) as { produto_id: string; unidade: string; etiquetas: number }[]).forEach((l) => {
      const p = disponivel.get(l.produto_id) || {}
      p[l.unidade] = (p[l.unidade] || 0) + l.etiquetas
      disponivel.set(l.produto_id, p)
    })
  }
  let abaixo = 0
  minimos.forEach((mins, produtoId) => {
    const disp = disponivel.get(produtoId) || {}
    const alguma = (Object.keys(mins) as UnidadeEstoque[]).some((u) => (mins[u] || 0) > 0 && (disp[u] || 0) < (mins[u] || 0))
    if (alguma) abaixo += 1
  })
  return abaixo
}
