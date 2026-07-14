'use client'
import { useState } from 'react'
import { responderCotacaoFornecedor, RespostaItemCotacao } from '@/lib/financeiro-cotacoes'
import { formatBRL } from '@/lib/ofx'
import { FinanceiroCotacaoFornecedor, FinanceiroCotacaoItem, FinanceiroCotacaoPreco } from '@/lib/types'
import { X, Loader, CheckCircle } from 'lucide-react'

interface Props {
  cotacaoFornecedor: FinanceiroCotacaoFornecedor
  itens: FinanceiroCotacaoItem[]
  precosExistentes: FinanceiroCotacaoPreco[]
  onClose: () => void
  onResolvido: () => void
}

interface LinhaResposta {
  valorUnitario: string
  valorTotal: string
  valorTotalEditado: boolean
  disponivel: boolean
}

export default function ResponderCotacaoModal({ cotacaoFornecedor, itens, precosExistentes, onClose, onResolvido }: Props) {
  const [linhas, setLinhas] = useState<Record<string, LinhaResposta>>(() => {
    const inicial: Record<string, LinhaResposta> = {}
    for (const item of itens) {
      const existente = precosExistentes.find((p) => p.cotacao_item_id === item.id)
      inicial[item.id] = {
        valorUnitario: existente?.valor_unitario != null ? String(existente.valor_unitario) : '',
        valorTotal: existente?.valor_total != null ? String(existente.valor_total) : '',
        valorTotalEditado: true,
        disponivel: existente?.disponivel ?? true,
      }
    }
    return inicial
  })
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  function atualizarLinha(itemId: string, patch: Partial<LinhaResposta>) {
    setLinhas((prev) => {
      const atual = prev[itemId]
      const nova = { ...atual, ...patch }
      if (patch.valorUnitario !== undefined && !atual.valorTotalEditado) {
        const item = itens.find((i) => i.id === itemId)
        const qtd = item?.quantidade || 0
        const unit = Number(patch.valorUnitario)
        if (qtd > 0 && unit > 0) nova.valorTotal = (qtd * unit).toFixed(2)
      }
      return { ...prev, [itemId]: nova }
    })
  }

  const todasValidas = itens.every((item) => {
    const l = linhas[item.id]
    if (!l) return false
    if (!l.disponivel) return true
    return Number(l.valorUnitario) > 0 && Number(l.valorTotal) > 0
  })

  async function confirmar() {
    if (!todasValidas) {
      setErro('Preencha o preço de todos os itens, ou marque como indisponível.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      const precos: RespostaItemCotacao[] = itens.map((item) => {
        const l = linhas[item.id]
        return {
          cotacao_item_id: item.id,
          valor_unitario: l.disponivel ? Number(l.valorUnitario) : null,
          valor_total: l.disponivel ? Number(l.valorTotal) : null,
          disponivel: l.disponivel,
        }
      })
      await responderCotacaoFornecedor(cotacaoFornecedor.id, precos)
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{cotacaoFornecedor.parte?.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          {itens.map((item) => {
            const l = linhas[item.id]
            if (!l) return null
            return (
              <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {item.materia_prima?.nome} <span className="font-normal text-gray-500">· {item.quantidade} {item.unidade_cotacao}</span>
                  </p>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={!l.disponivel}
                      onChange={(e) => atualizarLinha(item.id, { disponivel: !e.target.checked })}
                      className="w-3.5 h-3.5 rounded"
                    />
                    Não tem esse item
                  </label>
                </div>
                {l.disponivel && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Valor unitário (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.valorUnitario}
                        onChange={(e) => atualizarLinha(item.id, { valorUnitario: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Valor total (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.valorTotal}
                        onChange={(e) => atualizarLinha(item.id, { valorTotal: e.target.value, valorTotalEditado: true })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={confirmar}
          disabled={processando || !todasValidas}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
        >
          {processando ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />} Salvar preços
        </button>
      </div>
    </div>
  )
}
