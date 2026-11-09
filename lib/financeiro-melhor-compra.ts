import { FinanceiroCustoPorFornecedor, FinanceiroMateriaPrima } from './types'

export interface MelhorCompraGrupo {
  materia_prima_id: string
  materia_prima_nome: string
  unidade_medida: string
  unidade_compra: string
  fator_conversao: number
  fornecedores: (FinanceiroCustoPorFornecedor & { melhorPreco: boolean })[]
}

/**
 * Agrupa o histórico de custo por fornecedor (financeiro_custo_por_fornecedor)
 * por matéria-prima, ordenando os fornecedores do mais barato pro mais caro.
 * `melhorPreco` só marca o primeiro quando há mais de um fornecedor — com
 * um só não há o que comparar.
 */
export function agruparCustoPorFornecedor(
  custos: FinanceiroCustoPorFornecedor[],
  materias: Pick<FinanceiroMateriaPrima, 'id' | 'nome' | 'unidade_medida' | 'unidade_compra' | 'fator_conversao'>[]
): MelhorCompraGrupo[] {
  const materiaPorId = new Map(materias.map((m) => [m.id, m]))
  const grupos = new Map<string, FinanceiroCustoPorFornecedor[]>()
  custos.forEach((c) => {
    if (!grupos.has(c.materia_prima_id)) grupos.set(c.materia_prima_id, [])
    grupos.get(c.materia_prima_id)!.push(c)
  })

  return Array.from(grupos.entries())
    .filter(([materiaId]) => materiaPorId.has(materiaId))
    .map(([materiaId, lista]) => {
      const materia = materiaPorId.get(materiaId)!
      const ordenada = [...lista].sort((a, b) => a.custo_medio_por_unidade_medida - b.custo_medio_por_unidade_medida)
      return {
        materia_prima_id: materiaId,
        materia_prima_nome: materia.nome,
        unidade_medida: materia.unidade_medida,
        unidade_compra: materia.unidade_compra,
        fator_conversao: materia.fator_conversao,
        fornecedores: ordenada.map((f, i) => ({ ...f, melhorPreco: i === 0 && ordenada.length > 1 })),
      }
    })
    .sort((a, b) => a.materia_prima_nome.localeCompare(b.materia_prima_nome))
}

// --- visão "por fornecedor" (módulo Compras > Melhor compra) --------------------------------
// Mesmos dados de sempre (financeiro_custo_por_fornecedor, todo o histórico): só inverte o
// agrupamento — em vez de "pra cada item, quem é o mais barato", responde "em quais itens ESTE
// fornecedor é o mais barato". "Melhor" só conta com 2+ fornecedores comparáveis.

export interface ItemDoFornecedor {
  materia_prima_id: string
  materia_prima_nome: string
  unidade_medida: string
  unidade_compra: string
  fator_conversao: number
  deste: FinanceiroCustoPorFornecedor // linha do fornecedor selecionado
  melhor: FinanceiroCustoPorFornecedor // o mais barato do item (pode ser o próprio)
  proximo: FinanceiroCustoPorFornecedor | null // 2º colocado (quando o fornecedor é o melhor) ou o próprio melhor
  diferencaPct: number | null // melhor: quanto o 2º é mais caro; outros: quanto este é mais caro que o melhor
}

export interface ResumoFornecedor {
  parte_id: string
  fornecedor_nome: string
  itensVendidos: number
  itensComMelhorPreco: number
}

export function itensDoFornecedor(grupos: MelhorCompraGrupo[], parteId: string) {
  const melhores: ItemDoFornecedor[] = []
  const outros: ItemDoFornecedor[] = []
  const unicos: ItemDoFornecedor[] = []

  for (const g of grupos) {
    const deste = g.fornecedores.find((f) => f.parte_id === parteId)
    if (!deste) continue
    const base = {
      materia_prima_id: g.materia_prima_id,
      materia_prima_nome: g.materia_prima_nome,
      unidade_medida: g.unidade_medida,
      unidade_compra: g.unidade_compra,
      fator_conversao: g.fator_conversao,
      deste,
    }
    if (g.fornecedores.length === 1) {
      unicos.push({ ...base, melhor: deste, proximo: null, diferencaPct: null })
      continue
    }
    const melhor = g.fornecedores[0]
    if (melhor.parte_id === parteId) {
      const proximo = g.fornecedores[1]
      const pct = deste.custo_medio_por_unidade_medida > 0 ? ((proximo.custo_medio_por_unidade_medida - deste.custo_medio_por_unidade_medida) / deste.custo_medio_por_unidade_medida) * 100 : null
      melhores.push({ ...base, melhor, proximo, diferencaPct: pct })
    } else {
      const pct = melhor.custo_medio_por_unidade_medida > 0 ? ((deste.custo_medio_por_unidade_medida - melhor.custo_medio_por_unidade_medida) / melhor.custo_medio_por_unidade_medida) * 100 : null
      outros.push({ ...base, melhor, proximo: melhor, diferencaPct: pct })
    }
  }

  const porNome = (a: ItemDoFornecedor, b: ItemDoFornecedor) => a.materia_prima_nome.localeCompare(b.materia_prima_nome)
  melhores.sort((a, b) => (b.diferencaPct ?? 0) - (a.diferencaPct ?? 0) || porNome(a, b)) // maior economia primeiro
  outros.sort((a, b) => (b.diferencaPct ?? 0) - (a.diferencaPct ?? 0) || porNome(a, b)) // maior sobrepreço primeiro
  unicos.sort(porNome)
  return { melhores, outros, unicos }
}

export function resumirFornecedores(grupos: MelhorCompraGrupo[]): ResumoFornecedor[] {
  const mapa = new Map<string, ResumoFornecedor>()
  for (const g of grupos) {
    g.fornecedores.forEach((f, i) => {
      const atual = mapa.get(f.parte_id) || { parte_id: f.parte_id, fornecedor_nome: f.fornecedor_nome, itensVendidos: 0, itensComMelhorPreco: 0 }
      atual.itensVendidos += 1
      if (i === 0 && g.fornecedores.length > 1) atual.itensComMelhorPreco += 1
      mapa.set(f.parte_id, atual)
    })
  }
  return Array.from(mapa.values()).sort((a, b) => b.itensComMelhorPreco - a.itensComMelhorPreco || b.itensVendidos - a.itensVendidos || a.fornecedor_nome.localeCompare(b.fornecedor_nome))
}

/** Lê financeiro_custo_por_fornecedor inteira, em blocos de 1000 (a tela antiga lia sem paginar). */
export async function buscarCustoPorFornecedorCompleto(): Promise<FinanceiroCustoPorFornecedor[]> {
  const { supabase } = await import('./supabase')
  const linhas: FinanceiroCustoPorFornecedor[] = []
  let inicio = 0
  while (true) {
    const { data, error } = await supabase
      .from('financeiro_custo_por_fornecedor')
      .select('*')
      .order('materia_prima_id')
      .order('parte_id')
      .range(inicio, inicio + 999)
    if (error) throw error
    linhas.push(...((data || []) as FinanceiroCustoPorFornecedor[]))
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return linhas
}
