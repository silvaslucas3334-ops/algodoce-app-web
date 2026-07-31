import { FinanceiroCustoPorFornecedor, FinanceiroMateriaPrima } from './types'

export interface MelhorCompraGrupo {
  materia_prima_id: string
  materia_prima_nome: string
  unidade_medida: string
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
  materias: Pick<FinanceiroMateriaPrima, 'id' | 'nome' | 'unidade_medida'>[]
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
        fornecedores: ordenada.map((f, i) => ({ ...f, melhorPreco: i === 0 && ordenada.length > 1 })),
      }
    })
    .sort((a, b) => a.materia_prima_nome.localeCompare(b.materia_prima_nome))
}
