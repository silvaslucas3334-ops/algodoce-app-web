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
      const { data: ordensData } = await supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome)')
        .eq('status', 'concluida')
        .order('updated_at', { ascending: false })

      let ordens = ordensData || []

      // Aplicar filtros
      if (filtros.dataInicio) {
        ordens = ordens.filter(o => o.updated_at && o.updated_at.split('T')[0] >= filtros.dataInicio)
      }
      if (filtros.dataFim) {
        ordens = ordens.filter(o => o.updated_at && o.updated_at.split('T')[0] <= filtros.dataFim)
      }
      if (filtros.loja) {
        ordens = ordens.filter(o => o.loja_destino === filtros.loja)
      }

      setOrdensRelatorio(ordens)
    } catch (error) {
      console.error('Erro ao carregar ordens:', error)
    }
    setLoading(false)
  }

  // RELATÓRIO 2: ESTOQUE POR LOJA
  async function carregarEstoqueRelatorio() {
    setLoading(true)
    try {
      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome)')
        .order('destino')

      const lotes = lotesData || []

      // Agrupar por loja
      const agrupado: Record<string, any[]> = {}
      lotes.forEach(lote => {
        const loja = lote.destino || 'cozinha'
        if (!agrupado[loja]) agrupado[loja] = []
        agrupado[loja].push(lote)
      })

      setEstoqueRelatorio(Object.entries(agrupado).map(([loja, lotes]) => ({
        loja: LOCAL_LABEL[loja] || loja,
        loja_id: loja,
        total: lotes.length,
        na_cozinha: lotes.filter(l => l.status === 'na_cozinha').length,
        enviado: lotes.filter(l => l.status === 'enviado').length,
        na_loja: lotes.filter(l => l.status === 'na_loja').length,
        esgotado: lotes.filter(l => l.status === 'esgotado').length,
      })))
    } catch (error) {
      console.error('Erro ao carregar estoque:', error)
    }
    setLoading(false)
  }

  // RELATÓRIO 3: MOVIMENTAÇÃO
  async function carregarMovimentacaoRelatorio() {
    setLoading(true)
    try {
      const { data: movimentacaoData } = await supabase
        .from('movimentacoes_estoque')
        .select('*, lote:lotes_producao(*, produto:produtos(nome))')
        .order('created_at', { ascending: false })
        .limit(1000)

      let movimentacao = movimentacaoData || []

      // Aplicar filtros
      if (filtros.dataInicio) {
        movimentacao = movimentacao.filter(m => m.created_at && m.created_at.split('T')[0] >= filtros.dataInicio)
      }
      if (filtros.dataFim) {
        movimentacao = movimentacao.filter(m => m.created_at && m.created_at.split('T')[0] <= filtros.dataFim)
      }
      if (filtros.loja) {
        movimentacao = movimentacao.filter(m => m.local_origem === filtros.loja || m.local_destino === filtros.loja)
      }

      setMovimentacaoRelatorio(movimentacao)
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
                const headers = ['numero_ordem', 'produto_nome', 'quantidade', 'status', 'data_entrega', 'updated_at']
                const dados = ordensRelatorio.map(o => ({
                  numero_ordem: o.numero_ordem,
                  produto_nome: o.produto?.nome,
                  quantidade: o.quantidade,
                  status: o.status,
                  data_entrega: o.data_entrega,
                  updated_at: o.updated_at,
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
                  <th className="px-4 py-2 text-left">Data Entrega</th>
                  <th className="px-4 py-2 text-left">Concluída em</th>
                </tr>
              </thead>
              <tbody>
                {ordensRelatorio.map((ordem, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">#{ordem.numero_ordem}</td>
                    <td className="px-4 py-2">{ordem.produto?.nome}</td>
                    <td className="px-4 py-2 text-center">{ordem.quantidade}</td>
                    <td className="px-4 py-2">{ordem.data_entrega}</td>
                    <td className="px-4 py-2">{new Date(ordem.updated_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
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
            <h3 className="text-lg font-semibold text-gray-800">Estoque por Loja</h3>
            <button
              onClick={() => {
                const headers = ['loja', 'total', 'na_cozinha', 'enviado', 'na_loja', 'esgotado']
                exportarCSV(estoqueRelatorio, headers, 'relatorio-estoque')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {estoqueRelatorio.map((item, idx) => (
              <div key={idx} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-bold text-gray-800 mb-3">{item.loja}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total:</span>
                    <span className="font-semibold">{item.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Na Cozinha:</span>
                    <span className="font-semibold text-blue-600">{item.na_cozinha}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Enviado:</span>
                    <span className="font-semibold text-yellow-600">{item.enviado}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Na Loja:</span>
                    <span className="font-semibold text-green-600">{item.na_loja}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Esgotado:</span>
                    <span className="font-semibold text-red-600">{item.esgotado}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {estoqueRelatorio.length === 0 && (
            <div className="text-center py-8 text-gray-400">Nenhum dado encontrado</div>
          )}
        </div>
      )}

      {/* RELATÓRIO 3: MOVIMENTAÇÃO */}
      {abaRelatorio === 'movimentacao' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Movimentação de Produtos ({movimentacaoRelatorio.length})
            </h3>
            <button
              onClick={() => {
                const headers = ['tipo', 'produto', 'local_origem', 'local_destino', 'quantidade', 'registrado_por', 'data']
                const dados = movimentacaoRelatorio.map(m => ({
                  tipo: m.tipo,
                  produto: m.lote?.produto?.nome || 'N/A',
                  local_origem: m.local_origem || 'N/A',
                  local_destino: m.local_destino || 'N/A',
                  quantidade: m.quantidade,
                  registrado_por: m.registrado_por,
                  data: new Date(m.created_at).toLocaleDateString('pt-BR'),
                }))
                exportarCSV(dados, headers, 'relatorio-movimentacao')
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
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">Origem</th>
                  <th className="px-4 py-2 text-left">Destino</th>
                  <th className="px-4 py-2 text-center">Qtd</th>
                  <th className="px-4 py-2 text-left">Por</th>
                  <th className="px-4 py-2 text-left">Data</th>
                </tr>
              </thead>
              <tbody>
                {movimentacaoRelatorio.map((mov, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        mov.tipo === 'entrada' ? 'bg-green-100 text-green-700' :
                        mov.tipo === 'saida' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {mov.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-2">{mov.lote?.produto?.nome || 'N/A'}</td>
                    <td className="px-4 py-2">{LOCAL_LABEL[mov.local_origem] || mov.local_origem || 'N/A'}</td>
                    <td className="px-4 py-2">{LOCAL_LABEL[mov.local_destino] || mov.local_destino || 'N/A'}</td>
                    <td className="px-4 py-2 text-center">{mov.quantidade}</td>
                    <td className="px-4 py-2 text-xs">{mov.registrado_por}</td>
                    <td className="px-4 py-2">{new Date(mov.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimentacaoRelatorio.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhuma movimentação encontrada</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
