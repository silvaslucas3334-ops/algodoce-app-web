'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, Download } from 'lucide-react'
import { UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { buscarPedidosDoPeriodo, gerarItensVendidosFlat, gerarFaturamentoPorCategoria, calcularTotais } from '@/lib/pdv-report'
import { ItemVendidoFlat, FaturamentoPorCategoria } from '@/lib/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function exportarCSV(dados: any[], headers: string[], filename: string) {
  let csv = headers.join(',') + '\n'
  dados.forEach((row) => {
    const values = headers.map((h) => {
      let value = row[h] ?? ''
      if (typeof value === 'object') value = JSON.stringify(value)
      return `"${String(value).replace(/"/g, '""')}"`
    })
    csv += values.join(',') + '\n'
  })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
}

export default function RelatorioPdvPeriodoPage() {
  const router = useRouter()
  const params = useParams()
  const periodo = params.periodo as string

  const [aba, setAba] = useState<'itens' | 'categoria'>('itens')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [itensFlat, setItensFlat] = useState<ItemVendidoFlat[]>([])
  const [faturamentoCategoria, setFaturamentoCategoria] = useState<FaturamentoPorCategoria[]>([])
  const [totais, setTotais] = useState({ numeroPedidos: 0, faturamentoTotal: 0, ticketMedio: 0 })

  const match = periodo?.match(/^(loja1|loja2)-(\d{4})-(\d{2})$/)
  const unidade = match?.[1] as 'loja1' | 'loja2' | undefined
  const ano = match ? Number(match[2]) : 0
  const mes = match ? Number(match[3]) : 0 // 1-based

  useEffect(() => {
    if (unidade) carregar()
  }, [periodo])

  async function carregar() {
    if (!unidade) return
    setLoading(true)
    setErro('')
    try {
      const dataMin = `${ano}-${String(mes).padStart(2, '0')}-01`
      const ultimoDia = new Date(ano, mes, 0).getDate()
      const dataMax = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

      const pedidos = await buscarPedidosDoPeriodo(unidade, dataMin, dataMax)
      const flat = gerarItensVendidosFlat(pedidos)
      setItensFlat(flat)
      setFaturamentoCategoria(gerarFaturamentoPorCategoria(flat))
      setTotais(calcularTotais(pedidos))
    } catch (err: any) {
      console.error('Erro ao carregar relatório:', err)
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  function exportarItens() {
    const dados = itensFlat.map((l) => ({
      'Data/Hora': new Date(l.dataHoraItem).toLocaleString('pt-BR'),
      'Pedido': l.codPedido,
      'Produto': l.nomeProduto,
      'Categoria': l.categoriaProduto || '',
      'Quantidade': l.quantidade,
      'Valor Unitário': l.valorUnitario.toFixed(2),
      'Valor Total Item': l.valorTotalItem.toFixed(2),
      'Taxa de Entrega': l.taxaEntrega.toFixed(2),
      'Desconto': l.desconto.toFixed(2),
      'Acréscimo': l.acrescimo.toFixed(2),
      'Nº NF': l.numeroNf || '',
      'Valor Final': l.valorFinal.toFixed(2),
    }))
    exportarCSV(dados, Object.keys(dados[0] || {}), `itens-vendidos-${periodo}`)
  }

  function exportarCategoria() {
    const dados = faturamentoCategoria.map((c) => ({
      'Categoria': c.categoria,
      'Quantidade': c.quantidade,
      'Valor Final': c.valorFinal.toFixed(2),
      '%': c.percentual.toFixed(1),
    }))
    exportarCSV(dados, Object.keys(dados[0] || {}), `faturamento-categoria-${periodo}`)
  }

  if (!match) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Período inválido</div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro/pdv')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{MESES[mes - 1]} de {ano}</h1>
              <p className="text-sm text-gray-600">{UNIDADE_LABEL[unidade!]}</p>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Pedidos</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{totais.numeroPedidos}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Faturamento</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatBRL(totais.faturamentoTotal)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Ticket Médio</p>
                  <p className="text-xl font-bold text-gray-800 mt-1">{formatBRL(totais.ticketMedio)}</p>
                </div>
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setAba('itens')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${aba === 'itens' ? 'bg-pink-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                >
                  Itens Vendidos
                </button>
                <button
                  onClick={() => setAba('categoria')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${aba === 'categoria' ? 'bg-pink-700 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
                >
                  Faturamento por Categoria
                </button>
              </div>

              {aba === 'itens' ? (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <p className="text-sm text-gray-500">{itensFlat.length} linha(s)</p>
                    <button
                      onClick={exportarItens}
                      disabled={itensFlat.length === 0}
                      className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2 px-3">Pedido</th>
                          <th className="py-2 px-3">Produto</th>
                          <th className="py-2 px-3">Categoria</th>
                          <th className="py-2 px-3">Qtd.</th>
                          <th className="py-2 px-3">Valor Item</th>
                          <th className="py-2 px-3">Entrega</th>
                          <th className="py-2 px-3">Desconto</th>
                          <th className="py-2 px-3">Acréscimo</th>
                          <th className="py-2 px-3">Valor Final</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensFlat.map((l, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="py-2 px-3 text-gray-600">{l.codPedido}</td>
                            <td className="py-2 px-3 text-gray-800 font-medium">{l.nomeProduto}</td>
                            <td className="py-2 px-3 text-gray-600">{l.categoriaProduto || '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{l.quantidade}</td>
                            <td className="py-2 px-3 text-gray-600">{formatBRL(l.valorTotalItem)}</td>
                            <td className="py-2 px-3 text-gray-600">{l.taxaEntrega ? formatBRL(l.taxaEntrega) : '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{l.desconto ? formatBRL(l.desconto) : '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{l.acrescimo ? formatBRL(l.acrescimo) : '—'}</td>
                            <td className="py-2 px-3 text-gray-800 font-semibold">{formatBRL(l.valorFinal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <p className="text-sm text-gray-500">{faturamentoCategoria.length} categoria(s)</p>
                    <button
                      onClick={exportarCategoria}
                      disabled={faturamentoCategoria.length === 0}
                      className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-2 px-3">Categoria</th>
                        <th className="py-2 px-3">Quantidade</th>
                        <th className="py-2 px-3">Faturamento</th>
                        <th className="py-2 px-3">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {faturamentoCategoria.map((c) => (
                        <tr key={c.categoria} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-800 font-medium">{c.categoria}</td>
                          <td className="py-2 px-3 text-gray-600">{c.quantidade}</td>
                          <td className="py-2 px-3 text-gray-800 font-semibold">{formatBRL(c.valorFinal)}</td>
                          <td className="py-2 px-3 text-gray-600">{c.percentual.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
