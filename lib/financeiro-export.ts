import * as XLSX from 'xlsx'
import { FinanceiroProdutoFinal, FinanceiroPrePreparo } from './types'
import { calcularCustoProdutoFinal, calcularCustoPrePreparo } from './financeiro-cmv'
import { calcularMargemContribuicao } from './financeiro-precificacao'
import { STATUS_FICHA_TECNICA_LABEL } from './constants'

// .xlsm é macro-enabled (precisaria de VBA embutido) — como o pedido é só
// viabilizar análise em Excel, exporta .xlsx (abre igual, sem risco de
// "formato não bate com a extensão"). Mesma lib já usada na leitura do
// Import do PDV (lib/pdv-import.ts).
function nomeArquivo(prefixo: string): string {
  const d = new Date()
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${prefixo}-${data}.xlsx`
}

/** Exporta a lista de Produtos Finais (mesmos dados/custo já calculados na tela) — uma linha por produto. */
export function exportarProdutosFinaisXlsx(
  produtos: FinanceiroProdutoFinal[],
  custos: Record<string, ReturnType<typeof calcularCustoProdutoFinal>>,
  dvPct: number | null
): void {
  const linhas = produtos.map((p) => {
    const custo = custos[p.id]
    const margem =
      p.preco_venda != null && custo?.custoPorPorcao != null && dvPct != null
        ? calcularMargemContribuicao(p.preco_venda, custo.custoPorPorcao, dvPct)
        : null
    return {
      Nome: p.nome,
      'Código PDV Loja 1': p.codigo_pdv_loja1 || '',
      'Código PDV Loja 2': p.codigo_pdv_loja2 || '',
      'Rendimento (porções)': p.rendimento_porcoes,
      Combo: (p.itens || []).some((i) => i.produto_final_componente_id) ? 'Sim' : 'Não',
      'Permite Hierarquização': p.permite_hierarquizacao ? 'Sim' : 'Não',
      Status: STATUS_FICHA_TECNICA_LABEL[p.status] || p.status,
      Ativo: p.ativo ? 'Sim' : 'Não',
      'Custo por porção (R$)': custo?.custoPorPorcao != null ? Number(custo.custoPorPorcao.toFixed(2)) : null,
      'Preço de venda (R$)': p.preco_venda ?? null,
      'Margem de contribuição (%)': margem != null ? Number(margem.percentual.toFixed(1)) : null,
      Descrição: p.descricao || '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [
    { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
    { wch: 18 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 40 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos Finais')
  XLSX.writeFile(wb, nomeArquivo('produtos-finais'))
}

/** Exporta a lista de Pré-Preparos (mesmos dados/custo já calculados na tela) — uma linha por pré-preparo. */
export function exportarPrePreparosXlsx(
  prePreparos: FinanceiroPrePreparo[],
  custos: Record<string, ReturnType<typeof calcularCustoPrePreparo>>
): void {
  const linhas = prePreparos.map((p) => {
    const custo = custos[p.id]
    return {
      Código: p.codigo,
      Nome: p.nome,
      Unidade: p.unidade_medida,
      Rendimento: p.rendimento_quantidade,
      Status: STATUS_FICHA_TECNICA_LABEL[p.status] || p.status,
      Ativo: p.ativo ? 'Sim' : 'Não',
      'Custo por unidade (R$)': custo?.custoPorUnidade != null ? Number(custo.custoPorUnidade.toFixed(4)) : null,
      Descrição: p.descricao || '',
    }
  })

  const ws = XLSX.utils.json_to_sheet(linhas)
  ws['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Pré-Preparos')
  XLSX.writeFile(wb, nomeArquivo('pre-preparos'))
}
