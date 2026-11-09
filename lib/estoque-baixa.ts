import { supabase } from './supabase'

// Baixa de estoque — fonte ÚNICA. Antes havia 3 cópias (loja, cozinha e Scanner)
// com o mesmo `update status='esgotado'` + um insert por etiqueta, sem motivo e
// sem proteção contra duas pessoas baixando a mesma etiqueta.

export type MotivoBaixa = 'venda' | 'consumo' | 'vencido' | 'quebra' | 'degustacao' | 'uso_interno'

export const MOTIVOS_BAIXA: { key: MotivoBaixa; label: string }[] = [
  { key: 'venda', label: 'Venda' },
  { key: 'consumo', label: 'Consumo' },
  { key: 'vencido', label: 'Vencido' },
  { key: 'quebra', label: 'Quebra/perda' },
  { key: 'degustacao', label: 'Degustação/brinde' },
  { key: 'uso_interno', label: 'Uso interno' },
]

export const ROTULO_MOTIVO: Record<string, string> = Object.fromEntries(MOTIVOS_BAIXA.map((m) => [m.key, m.label]))

/** Motivo já marcado quando a folha abre: loja vende, cozinha consome. */
export function motivoPadrao(local: string): MotivoBaixa {
  return local === 'cozinha' ? 'consumo' : 'venda'
}

/** Onde a etiqueta está "na prateleira" de cada unidade. */
function statusNaPrateleira(local: string): 'na_cozinha' | 'na_loja' {
  return local === 'cozinha' ? 'na_cozinha' : 'na_loja'
}

interface OpcoesBaixa {
  local: string // 'cozinha' | 'loja1' | 'loja2'
  motivo: MotivoBaixa
  operador: string
}

export interface ResultadoBaixa {
  baixadas: string[] // ids realmente baixados
  ignoradas: string[] // já não estavam na prateleira (outra pessoa baixou antes, foi enviada...)
}

const BLOCO = 150 // ids por requisição: .in() vira parte da URL

/**
 * Baixa etiquetas específicas. Só baixa o que AINDA está na prateleira da unidade
 * (update condicionado ao status) e só registra a movimentação do que foi de fato
 * baixado — duas pessoas baixando a mesma etiqueta não duplicam o histórico.
 */
export async function baixarEtiquetas(ids: string[], { local, motivo, operador }: OpcoesBaixa): Promise<ResultadoBaixa> {
  const baixadas: string[] = []
  const unicos = Array.from(new Set(ids))

  for (let i = 0; i < unicos.length; i += BLOCO) {
    const bloco = unicos.slice(i, i + BLOCO)
    let atualizar = supabase
      .from('lotes_producao')
      .update({ status: 'esgotado' })
      .in('id', bloco)
      .eq('status', statusNaPrateleira(local))
    if (local !== 'cozinha') atualizar = atualizar.eq('destino', local)

    const { data, error } = await atualizar.select('id, quantidade')
    if (error) throw error
    const efetivas = (data || []) as { id: string; quantidade: number | null }[]
    if (efetivas.length === 0) continue

    const { error: erroMov } = await supabase.from('movimentacoes_estoque').insert(
      efetivas.map((l) => ({
        lote_id: l.id,
        tipo: 'saida',
        local_origem: local,
        quantidade: l.quantidade ?? 1,
        registrado_por: operador || 'Sistema',
        motivo,
      }))
    )
    if (erroMov) throw erroMov
    baixadas.push(...efetivas.map((l) => l.id))
  }

  const feitas = new Set(baixadas)
  return { baixadas, ignoradas: unicos.filter((id) => !feitas.has(id)) }
}

/**
 * Baixa N etiquetas de um produto, das que vencem primeiro (FEFO). Cada etiqueta é
 * 1 unidade (ver app/producao/novo-lote), então N = nº de etiquetas.
 * `excluirIds`: etiquetas já escolhidas à mão na mesma baixa (não escolher de novo).
 * `faltaram` > 0 quando o estoque tinha menos que o pedido.
 */
export async function baixarPorQuantidade(
  produtoId: string,
  quantidade: number,
  opcoes: OpcoesBaixa & { excluirIds?: string[]; apenasOrdemInterna?: boolean }
): Promise<ResultadoBaixa & { faltaram: number }> {
  if (quantidade <= 0) return { baixadas: [], ignoradas: [], faltaram: 0 }

  let consulta = supabase
    .from('lotes_producao')
    .select('id, ordem:ordens_producao(tipo_ordem)')
    .eq('produto_id', produtoId)
    .eq('status', statusNaPrateleira(opcoes.local))
    .order('data_validade', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (opcoes.local !== 'cozinha') consulta = consulta.eq('destino', opcoes.local)

  // Pede um pouco a mais pra poder descartar as já escolhidas / de outro tipo.
  const { data, error } = await consulta.limit(quantidade + (opcoes.excluirIds?.length || 0) + 50)
  if (error) throw error

  const excluir = new Set(opcoes.excluirIds || [])
  const candidatas = (data || [])
    .filter((l: any) => !excluir.has(l.id))
    .filter((l: any) => {
      if (!opcoes.apenasOrdemInterna) return true
      const ordem = Array.isArray(l.ordem) ? l.ordem[0] : l.ordem
      return ordem?.tipo_ordem === 'interna'
    })
    .slice(0, quantidade)
    .map((l: any) => l.id as string)

  const resultado = await baixarEtiquetas(candidatas, opcoes)
  return { ...resultado, faltaram: quantidade - resultado.baixadas.length }
}
