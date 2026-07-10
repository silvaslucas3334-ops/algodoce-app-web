import { supabase } from './supabase'
import { PDV_STATUS_RECEITA } from './constants'
import { FinanceiroPdvPedido, ItemVendidoFlat, FaturamentoPorCategoria } from './types'

export async function buscarPedidosDoPeriodo(
  unidade: 'loja1' | 'loja2',
  dataMin: string,
  dataMax: string
): Promise<FinanceiroPdvPedido[]> {
  const { data, error } = await supabase
    .from('financeiro_pdv_pedidos')
    .select('*, itens:financeiro_pdv_itens(*)')
    .eq('unidade', unidade)
    .gte('data_abertura', `${dataMin}T00:00:00-03:00`)
    .lte('data_abertura', `${dataMax}T23:59:59-03:00`)
    .in('status', PDV_STATUS_RECEITA)
    .order('data_abertura')
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Reconstrói o relatório "Itens Vendidos" (mesma forma da planilha manual
 * do usuário) a partir das tabelas normalizadas. Os campos do pedido
 * (entrega/desconto/serviço/NF) ficam gravados só em financeiro_pdv_pedidos
 * — aqui, ao achatar pra um-item-por-linha, eles são aplicados só na
 * PRIMEIRA linha de cada pedido (por ordem_pedido), replicando a coluna "X"
 * da planilha manual sem duplicar o ajuste ao somar a coluna inteira.
 * Mapeamento confirmado com o usuário: Taxa de Entrega ← valor_entrega,
 * Desconto ← desconto, Acréscimo ← serviço.
 */
export function gerarItensVendidosFlat(pedidos: FinanceiroPdvPedido[]): ItemVendidoFlat[] {
  const linhas: ItemVendidoFlat[] = []
  for (const pedido of pedidos) {
    const itensOrdenados = [...(pedido.itens || [])].sort((a, b) => a.ordem_pedido - b.ordem_pedido)
    itensOrdenados.forEach((item, idx) => {
      const primeira = idx === 0
      const ajuste = primeira ? pedido.valor_entrega + pedido.servico - pedido.desconto : 0
      linhas.push({
        dataHoraItem: item.data_hora_item,
        nomeProduto: item.nome_produto,
        tipoProduto: item.tipo_produto || null,
        categoriaProduto: item.categoria_produto || null,
        quantidade: item.quantidade,
        valorUnitario: item.valor_unitario,
        valorTotalItem: item.valor_total_item,
        codPedido: pedido.codigo,
        taxaEntrega: primeira ? pedido.valor_entrega : 0,
        desconto: primeira ? pedido.desconto : 0,
        acrescimo: primeira ? pedido.servico : 0,
        numeroNf: primeira ? pedido.numero_nf || null : null,
        valorFinal: item.valor_total_item + ajuste,
      })
    })
  }
  return linhas
}

export function gerarFaturamentoPorCategoria(linhasFlat: ItemVendidoFlat[]): FaturamentoPorCategoria[] {
  const totalGeral = linhasFlat.reduce((s, l) => s + l.valorFinal, 0)
  const mapa = new Map<string, { categoria: string; quantidade: number; valorFinal: number }>()
  for (const l of linhasFlat) {
    const cat = l.categoriaProduto || 'Sem categoria'
    if (!mapa.has(cat)) mapa.set(cat, { categoria: cat, quantidade: 0, valorFinal: 0 })
    const c = mapa.get(cat)!
    c.quantidade += l.quantidade
    c.valorFinal += l.valorFinal
  }
  return Array.from(mapa.values())
    .map((c) => ({ ...c, percentual: totalGeral ? (c.valorFinal / totalGeral) * 100 : 0 }))
    .sort((a, b) => b.valorFinal - a.valorFinal)
}

export interface TotaisPeriodo {
  numeroPedidos: number
  faturamentoTotal: number
  ticketMedio: number
}

export function calcularTotais(pedidos: FinanceiroPdvPedido[]): TotaisPeriodo {
  const numeroPedidos = pedidos.length
  const faturamentoTotal = pedidos.reduce((s, p) => s + p.total, 0)
  return {
    numeroPedidos,
    faturamentoTotal,
    ticketMedio: numeroPedidos ? faturamentoTotal / numeroPedidos : 0,
  }
}
