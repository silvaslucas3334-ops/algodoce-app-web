'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { Download, Filter, X } from 'lucide-react'

export default function RelatoriosTab() {
  const [lotes, setLotes] = useState<any[]>([])
  const [lotesFiltered, setLotesFiltered] = useState<any[]>([])
  const [ordens, setOrdens] = useState<any[]>([])
  const [ordensFiltered, setOrdensFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [abaRelatorio, setAbaRelatorio] = useState<'lotes' | 'ordens'>('lotes')
  const [filtrosAplicados, setFiltrosAplicados] = useState(false)

  // Filtros
  const [filtros, setFiltros] = useState({
    dataInicio: '',
    dataFim: '',
    validadeInicio: '',
    validadeFim: '',
    produto: '',
    codigoQR: '',
    status: '',
    loja: '',
    tipo: 'todos', // entrada, saida, transferencia, todos
  })

  const [produtos, setProdutos] = useState<any[]>([])

  useEffect(() => {
    carregarProdutos()
  }, [])

  // Real-time listeners para lotes e ordens
  useRealtimeData({
    table: 'lotes_producao',
    onInsert: () => { setLotesFiltered([]); setFiltrosAplicados(false) },
    onUpdate: () => { setLotesFiltered([]); setFiltrosAplicados(false) },
    onDelete: () => { setLotesFiltered([]); setFiltrosAplicados(false) }
  })

  useRealtimeData({
    table: 'ordens_producao',
    onInsert: () => { setOrdensFiltered([]); setFiltrosAplicados(false) },
    onUpdate: () => { setOrdensFiltered([]); setFiltrosAplicados(false) },
    onDelete: () => { setOrdensFiltered([]); setFiltrosAplicados(false) }
  })

  async function carregarProdutos() {
    const { data: produtosData } = await supabase.from('produtos').select('id, nome').order('nome')
    setProdutos(produtosData || [])
  }

  async function aplicarFiltrosClick() {
    setLoading(true)
    setFiltrosAplicados(true)
    try {
      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome, tipo), ordem:ordens_producao(numero_ordem)')
        .order('created_at', { ascending: false })

      const { data: ordensData } = await supabase
        .from('ordens_producao')
        .select('*')
        .order('created_at', { ascending: false })

      setLotes(lotesData || [])
      setOrdens(ordensData || [])

      // Aplicar filtros após carregar
      aplicarFiltros()
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    }
    setLoading(false)
  }

  function aplicarFiltros() {
    // Filtrar lotes
    let resultadoLotes = [...lotes]

    if (filtros.dataInicio) {
      resultadoLotes = resultadoLotes.filter(l => l.data_producao >= filtros.dataInicio)
    }
    if (filtros.dataFim) {
      resultadoLotes = resultadoLotes.filter(l => l.data_producao <= filtros.dataFim)
    }
    if (filtros.validadeInicio) {
      resultadoLotes = resultadoLotes.filter(l => l.data_validade >= filtros.validadeInicio)
    }
    if (filtros.validadeFim) {
      resultadoLotes = resultadoLotes.filter(l => l.data_validade <= filtros.validadeFim)
    }
    if (filtros.produto) {
      resultadoLotes = resultadoLotes.filter(l => l.produto_id === filtros.produto)
    }
    if (filtros.codigoQR) {
      resultadoLotes = resultadoLotes.filter(l => l.codigo_qr.includes(filtros.codigoQR.toUpperCase()))
    }
    if (filtros.status) {
      resultadoLotes = resultadoLotes.filter(l => l.status === filtros.status)
    }
    if (filtros.loja) {
      resultadoLotes = resultadoLotes.filter(l => l.destino === filtros.loja)
    }

    setLotesFiltered(resultadoLotes)
    setOrdensFiltered(ordens) // Ordens sem filtro por enquanto
  }


  function limparFiltros() {
    setFiltros({
      dataInicio: '',
      dataFim: '',
      validadeInicio: '',
      validadeFim: '',
      produto: '',
      codigoQR: '',
      status: '',
      loja: '',
      tipo: 'todos',
    })
  }

  function exportarCSV() {
    let csv = 'Data Produção,Data Validade,Produto,Quantidade,Código QR,Status,Destino,Produtor,Ordem\n'
    lotesFiltered.forEach(l => {
      csv += `${l.data_producao},${l.data_validade},"${l.produto?.nome}",${l.quantidade},${l.codigo_qr},${l.status},${l.destino},${l.produzido_por},#${l.ordem?.numero_ordem || 'N/A'}\n`
    })
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-lotes-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Relatórios Customizáveis</h2>
        <button
          onClick={exportarCSV}
          disabled={lotesFiltered.length === 0}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          <Download size={18} /> Exportar CSV
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setAbaRelatorio('lotes')}
          className={`px-4 py-2 rounded-lg font-medium ${abaRelatorio === 'lotes' ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          📦 Lotes Produzidos
        </button>
        <button
          onClick={() => setAbaRelatorio('ordens')}
          className={`px-4 py-2 rounded-lg font-medium ${abaRelatorio === 'ordens' ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          📋 Ordens Criadas
        </button>
      </div>

      {/* Painel de Filtros - Lotes */}
      {abaRelatorio === 'lotes' && (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Data Produção */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Produção (De)</label>
            <input
              type="date"
              value={filtros.dataInicio}
              onChange={e => setFiltros({ ...filtros, dataInicio: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Produção (Até)</label>
            <input
              type="date"
              value={filtros.dataFim}
              onChange={e => setFiltros({ ...filtros, dataFim: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Data Validade */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade (De)</label>
            <input
              type="date"
              value={filtros.validadeInicio}
              onChange={e => setFiltros({ ...filtros, validadeInicio: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade (Até)</label>
            <input
              type="date"
              value={filtros.validadeFim}
              onChange={e => setFiltros({ ...filtros, validadeFim: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Produto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
            <select
              value={filtros.produto}
              onChange={e => setFiltros({ ...filtros, produto: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              {produtos.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Código QR */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código QR</label>
            <input
              type="text"
              placeholder="ALD-..."
              value={filtros.codigoQR}
              onChange={e => setFiltros({ ...filtros, codigoQR: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filtros.status}
              onChange={e => setFiltros({ ...filtros, status: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              <option value="na_cozinha">Na Cozinha</option>
              <option value="enviado">Enviado</option>
              <option value="na_loja">Na Loja</option>
              <option value="esgotado">Esgotado</option>
            </select>
          </div>

          {/* Loja */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
            <select
              value={filtros.loja}
              onChange={e => setFiltros({ ...filtros, loja: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Todos</option>
              {Object.entries(LOCAL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={aplicarFiltrosClick}
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
      )}

      {/* Resultados */}
      {abaRelatorio === 'lotes' && filtrosAplicados && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-sm text-gray-600 font-medium">
            {loading ? 'Carregando...' : `${lotesFiltered.length} resultado${lotesFiltered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : lotesFiltered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nenhum resultado encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Produto</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Qtd</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Data Prod.</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Validade</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Código QR</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Destino</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Produtor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lotesFiltered.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">{l.produto?.nome}</td>
                    <td className="px-6 py-3">{l.quantidade}</td>
                    <td className="px-6 py-3 text-xs">
                      {new Date(l.data_producao + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-xs">
                      {new Date(l.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-3 text-xs font-mono">{l.codigo_qr}</td>
                    <td className="px-6 py-3 text-xs">
                      <span
                        className={`inline-block px-2 py-1 rounded font-medium ${
                          l.status === 'na_cozinha'
                            ? 'bg-blue-100 text-blue-700'
                            : l.status === 'enviado'
                              ? 'bg-yellow-100 text-yellow-700'
                              : l.status === 'na_loja'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {l.status === 'na_cozinha'
                          ? 'Cozinha'
                          : l.status === 'enviado'
                            ? 'Enviado'
                            : l.status === 'na_loja'
                              ? 'Loja'
                              : 'Esgotado'}
                      </span>
                    </td>
                    <td className="px-6 py-3">{LOCAL_LABEL[l.destino]}</td>
                    <td className="px-6 py-3">{l.produzido_por}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Tabela Ordens */}
      {abaRelatorio === 'ordens' && filtrosAplicados && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-sm text-gray-600 font-medium">
            {loading ? 'Carregando...' : `${ordensFiltered.length} ordem${ordensFiltered.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : ordensFiltered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nenhuma ordem encontrada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Ordem</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Solicitado por</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Destino</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Data Solicitação</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Data Entrega</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">Tempo Produção</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ordensFiltered.map((o: any) => {
                  const tempoProducao = o.hora_fim_prod && o.hora_inicio_prod
                    ? Math.round((new Date(o.hora_fim_prod).getTime() - new Date(o.hora_inicio_prod).getTime()) / 60000)
                    : null
                  return (
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">#{o.numero_ordem || o.id.slice(0, 8)}</td>
                      <td className="px-6 py-3 text-xs">
                        <span className={`inline-block px-2 py-1 rounded font-medium ${
                          o.status === 'pendente' ? 'bg-amber-100 text-amber-700'
                          : o.status === 'em_producao' ? 'bg-blue-100 text-blue-700'
                          : o.status === 'concluida' ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                          {o.status === 'pendente' ? 'Pendente'
                          : o.status === 'em_producao' ? 'Em Produção'
                          : o.status === 'concluida' ? 'Concluída'
                          : 'Cancelada'}
                        </span>
                      </td>
                      <td className="px-6 py-3">{o.solicitado_por}</td>
                      <td className="px-6 py-3">{LOCAL_LABEL[o.loja_destino] || o.loja_destino}</td>
                      <td className="px-6 py-3 text-xs">{new Date(o.data_solicitacao + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-6 py-3 text-xs">{new Date(o.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-6 py-3 text-xs">{tempoProducao ? `${tempoProducao} min` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
