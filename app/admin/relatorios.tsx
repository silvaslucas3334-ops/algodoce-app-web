'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { Download, Filter, X } from 'lucide-react'

export default function RelatoriosTab() {
  const [abaRelatorio, setAbaRelatorio] = useState<'ordens' | 'estoque' | 'movimentacao'>('ordens')
  const [loading, setLoading] = useState(false)

  // Filtros
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    loja: '',
    produto: '',
  })

  // Estados para cada relatório
  const [ordensRelatorio, setOrdensRelatorio] = useState<any[]>([])
  const [estoqueRelatorio, setEstoqueRelatorio] = useState<any[]>([])
  const [movimentacaoRelatorio, setMovimentacaoRelatorio] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])

  useEffect(() => {
    carregarProdutos()
  }, [])

  async function carregarProdutos() {
    const { data } = await supabase.from('produtos').select('id, nome').order('nome')
    setProdutos(data || [])
  }

  // RELATÓRIO 1: ORDENS PRODUZIDAS
  async function carregarOrdensRelatorio() {
    setLoading(true)
    try {
      let query = supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome)')
        .eq('status', 'concluida')
        .order('updated_at', { ascending: false })

      const { data: ordensData } = await query

      let ordens = ordensData || []

      // Aplicar filtros
      if (filtros.dataInicio) {
        ordens = ordens.filter(o => o.created_at && o.created_at.split('T')[0] >= filtros.dataInicio)
      }
      if (filtros.dataFim) {
        ordens = ordens.filter(o => o.created_at && o.created_at.split('T')[0] <= filtros.dataFim)
      }

      setOrdensRelatorio(ordens)
    } catch (error) {
      console.error('Erro ao carregar ordens:', error)
    }
    setLoading(false)
  }

  // RELATÓRIO 2: ESTOQUE POR LOJA (apenas itens em estoque)
  async function carregarEstoqueRelatorio() {
    setLoading(true)
    try {
      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome)')
        .neq('status', 'esgotado')
        .order('destino')

      const lotes = lotesData || []

      // Agrupar por loja e contar itens
      const agrupado: Record<string, any> = {}

      lotes.forEach(lote => {
        const loja = lote.destino || 'cozinha'
        if (!agrupado[loja]) {
          agrupado[loja] = {
            loja: LOCAL_LABEL[loja] || loja,
            loja_id: loja,
            itens: [],
            total: 0,
          }
        }
        agrupado[loja].itens.push(lote)
        agrupado[loja].total += 1
      })

      setEstoqueRelatorio(Object.values(agrupado))
    } catch (error) {
      console.error('Erro ao carregar estoque:', error)
    }
    setLoading(false)
  }

  // RELATÓRIO 3: MOVIMENTAÇÃO (etiquetas com todas as movimentações)
  async function carregarMovimentacaoRelatorio() {
    setLoading(true)
    try {
      // Carregar lotes (etiquetas) com suas ordens
      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome), ordem:ordens_producao(numero_ordem, loja_destino)')
        .order('created_at', { ascending: false })

      // Carregar todas as movimentações
      const { data: movimentacoesData } = await supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('created_at', { ascending: false })

      const lotes = lotesData || []
      const movimentacoes = movimentacoesData || []

      // Agrupar movimentações por lote
      const movimentacoesPorLote: Record<string, any[]> = {}
      movimentacoes.forEach(mov => {
        if (!movimentacoesPorLote[mov.lote_id]) {
          movimentacoesPorLote[mov.lote_id] = []
        }
        movimentacoesPorLote[mov.lote_id].push(mov)
      })

      // Construir resultado com lotes e suas movimentações
      let resultado = lotes.map(lote => ({
        lote_id: lote.id,
        codigo_qr: lote.codigo_qr,
        ordem_numero: lote.ordem?.numero_ordem || 'N/A',
        ordem_destino: LOCAL_LABEL[lote.ordem?.loja_destino] || lote.ordem?.loja_destino || 'N/A',
        produto: lote.produto?.nome,
        data_producao: lote.data_producao,
        produzido_por: lote.produzido_por,
        status_atual: lote.status,
        movimentacoes: movimentacoesPorLote[lote.id] || [],
      }))

      // Aplicar filtros
      if (filtros.dataInicio) {
        resultado = resultado.filter(r => r.data_producao >= filtros.dataInicio)
      }
      if (filtros.dataFim) {
        resultado = resultado.filter(r => r.data_producao <= filtros.dataFim)
      }
      if (filtros.loja) {
        resultado = resultado.filter(r => {
          // Filtrar por loja de origem ou destino
          const movs = r.movimentacoes
          return movs.some(m => m.local_origem === filtros.loja || m.local_destino === filtros.loja)
        })
      }

      setMovimentacaoRelatorio(resultado)
    } catch (error) {
      console.error('Erro ao carregar movimentação:', error)
    }
    setLoading(false)
  }

  function aplicarFiltros() {
    if (abaRelatorio === 'ordens') carregarOrdensRelatorio()
    if (abaRelatorio === 'estoque') carregarEstoqueRelatorio()
    if (abaRelatorio === 'movimentacao') carregarMovimentacaoRelatorio()
  }

  function limparFiltros() {
    setFiltros({ dataInicio: '', dataFim: '', loja: '', produto: '' })
  }

  function exportarCSV(dados: any[], headers: string[], filename: string) {
    let csv = headers.join(',') + '\n'
    dados.forEach(row => {
      const values = headers.map(h => {
        let value = row[h] || ''
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Relatórios</h2>
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setAbaRelatorio('ordens')}
          className={`px-4 py-2 rounded-lg font-medium ${abaRelatorio === 'ordens' ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          📋 Ordens Produzidas
        </button>
        <button
          onClick={() => setAbaRelatorio('estoque')}
          className={`px-4 py-2 rounded-lg font-medium ${abaRelatorio === 'estoque' ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          📦 Estoque por Loja
        </button>
        <button
          onClick={() => setAbaRelatorio('movimentacao')}
          className={`px-4 py-2 rounded-lg font-medium ${abaRelatorio === 'movimentacao' ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          🔄 Movimentação
        </button>
      </div>

      {/* Painel de Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data (De)</label>
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={e => setFiltros({ ...filtros, dataInicio: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data (Até)</label>
            <input
              type="date"
              value={filtros.dataFim}
              onChange={e => setFiltros({ ...filtros, dataFim: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loja</label>
            <select
              value={filtros.loja}
              onChange={e => setFiltros({ ...filtros, loja: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Todas</option>
              {Object.entries(LOCAL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
            <select
              value={filtros.produto}
              onChange={e => setFiltros({ ...filtros, produto: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              {produtos.map((p: any) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={aplicarFiltros}
            disabled={loading}
            className="flex items-center gap-2 bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pink-800 disabled:opacity-50"
          >
            <Filter size={16} /> {loading ? 'Carregando...' : 'Filtrar'}
          </button>
          <button
            onClick={limparFiltros}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            <X size={16} /> Limpar
          </button>
        </div>
      </div>

      {/* RELATÓRIO 1: ORDENS */}
      {abaRelatorio === 'ordens' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Ordens Concluídas ({ordensRelatorio.length})
            </h3>
            <button
              onClick={() => {
                const headers = ['numero_ordem', 'produto_nome', 'quantidade', 'data_criacao', 'data_conclusao']
                const dados = ordensRelatorio.map(o => ({
                  numero_ordem: o.numero_ordem || o.id.substring(0, 8),
                  produto_nome: o.produto?.nome,
                  quantidade: o.quantidade,
                  data_criacao: new Date(o.created_at).toLocaleString('pt-BR'),
                  data_conclusao: new Date(o.updated_at).toLocaleString('pt-BR'),
                }))
                exportarCSV(dados, headers, 'relatorio-ordens')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Ordem</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-center">Qtd</th>
                  <th className="px-4 py-2 text-left">Início Produção</th>
                  <th className="px-4 py-2 text-left">Fim Produção</th>
                  <th className="px-4 py-2 text-left">Tempo Total</th>
                </tr>
              </thead>
              <tbody>
                {ordensRelatorio.map((ordem, idx) => {
                  const inicio = new Date(ordem.created_at)
                  const fim = new Date(ordem.updated_at)
                  const tempoMs = fim.getTime() - inicio.getTime()
                  const horas = Math.floor(tempoMs / (1000 * 60 * 60))
                  const minutos = Math.floor((tempoMs % (1000 * 60 * 60)) / (1000 * 60))
                  const tempoTotal = `${horas}h ${minutos}m`

                  return (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">#{ordem.numero_ordem || ordem.id.substring(0, 8)}</td>
                      <td className="px-4 py-2">{ordem.produto?.nome}</td>
                      <td className="px-4 py-2 text-center">{ordem.quantidade}</td>
                      <td className="px-4 py-2 text-xs">{inicio.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-xs">{fim.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 font-semibold text-blue-600">{tempoTotal}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {ordensRelatorio.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhuma ordem encontrada</div>
            )}
          </div>
        </div>
      )}

      {/* RELATÓRIO 2: ESTOQUE POR LOJA */}
      {abaRelatorio === 'estoque' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Estoque Atual por Loja</h3>
            <button
              onClick={() => {
                const headers = ['loja', 'total_itens']
                const dados = estoqueRelatorio.map(e => ({
                  loja: e.loja,
                  total_itens: e.total,
                }))
                exportarCSV(dados, headers, 'relatorio-estoque')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {estoqueRelatorio.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800">{item.loja}</h4>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                    {item.total} itens
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                    <span className="text-gray-700">Na Cozinha:</span>
                    <span className="font-semibold text-blue-600">
                      {item.itens.filter((i: any) => i.status === 'na_cozinha').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-yellow-50 rounded">
                    <span className="text-gray-700">Enviado:</span>
                    <span className="font-semibold text-yellow-600">
                      {item.itens.filter((i: any) => i.status === 'enviado').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                    <span className="text-gray-700">Na Loja:</span>
                    <span className="font-semibold text-green-600">
                      {item.itens.filter((i: any) => i.status === 'na_loja').length}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <details className="text-xs">
                    <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-800">
                      Ver produtos
                    </summary>
                    <div className="mt-2 space-y-1">
                      {item.itens.map((lote: any, i: number) => (
                        <div key={i} className="text-gray-600 ml-2 text-xs">
                          • {lote.produto?.nome}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
          {estoqueRelatorio.length === 0 && (
            <div className="text-center py-8 text-gray-400">Nenhum item em estoque</div>
          )}
        </div>
      )}

      {/* RELATÓRIO 3: MOVIMENTAÇÃO */}
      {abaRelatorio === 'movimentacao' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Movimentação de Produtos ({movimentacaoRelatorio.length} etiquetas)
            </h3>
            <button
              onClick={() => {
                const dados: any[] = []
                movimentacaoRelatorio.forEach(etiqueta => {
                  etiqueta.movimentacoes.forEach((mov: any) => {
                    dados.push({
                      etiqueta: etiqueta.codigo_qr,
                      ordem: etiqueta.ordem_numero,
                      produto: etiqueta.produto,
                      tipo: mov.tipo,
                      origem: LOCAL_LABEL[mov.local_origem] || mov.local_origem,
                      destino: LOCAL_LABEL[mov.local_destino] || mov.local_destino,
                      quantidade: mov.quantidade,
                      por: mov.registrado_por,
                      data: new Date(mov.created_at).toLocaleString('pt-BR'),
                    })
                  })
                })
                const headers = ['etiqueta', 'ordem', 'produto', 'tipo', 'origem', 'destino', 'quantidade', 'por', 'data']
                exportarCSV(dados, headers, 'relatorio-movimentacao')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar
            </button>
          </div>

          <div className="space-y-4">
            {movimentacaoRelatorio.map((etiqueta, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200">
                  <div>
                    <p className="font-mono text-xs text-gray-500">Etiqueta: {etiqueta.codigo_qr}</p>
                    <p className="font-semibold text-gray-800">Ordem #{etiqueta.ordem_numero}</p>
                    <p className="text-sm text-gray-600">{etiqueta.produto}</p>
                    <p className="text-xs text-gray-500 mt-1">Destino: {etiqueta.ordem_destino}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    etiqueta.status_atual === 'esgotado' ? 'bg-red-100 text-red-700' :
                    etiqueta.status_atual === 'na_loja' ? 'bg-green-100 text-green-700' :
                    etiqueta.status_atual === 'enviado' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {etiqueta.status_atual}
                  </span>
                </div>

                {etiqueta.movimentacoes.length > 0 ? (
                  <div className="space-y-2">
                    {etiqueta.movimentacoes.map((mov: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-700 p-2 bg-gray-50 rounded">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          mov.tipo === 'entrada' ? 'bg-green-100 text-green-700' :
                          mov.tipo === 'saida' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {mov.tipo}
                        </span>
                        <span>
                          {LOCAL_LABEL[mov.local_origem] || mov.local_origem || '-'}
                          →
                          {LOCAL_LABEL[mov.local_destino] || mov.local_destino || '-'}
                        </span>
                        <span className="font-semibold">({mov.quantidade})</span>
                        <span className="text-gray-500">por {mov.registrado_por}</span>
                        <span className="ml-auto text-gray-400">{new Date(mov.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 p-2">Sem movimentações registradas</div>
                )}
              </div>
            ))}
          </div>
          {movimentacaoRelatorio.length === 0 && (
            <div className="text-center py-8 text-gray-400">Nenhuma etiqueta encontrada</div>
          )}
        </div>
      )}
    </div>
  )
}
