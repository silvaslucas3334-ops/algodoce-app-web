'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { Download, Filter, X, ChevronDown } from 'lucide-react'

export default function RelatoriosTab() {
  const [abaRelatorio, setAbaRelatorio] = useState<'estoque' | 'movimentacao' | 'produtos' | 'usuarios' | 'producao'>('estoque')
  const [loading, setLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // ===== RELATÓRIO 1: ESTOQUE POR UNIDADE =====
  const [estoqueData, setEstoqueData] = useState<any[]>([])
  const [dataConsultaEstoque, setDataConsultaEstoque] = useState<string>('')
  const [filtrosEstoque, setFiltrosEstoque] = useState({
    unidade: 'cozinha',
  })

  const [movimentacaoData, setMovimentacaoData] = useState<any[]>([])
  const [filtrosMov, setFiltrosMov] = useState({
    dataInicio: '',
    dataFim: '',
    qrCode: '',
    produto: '',
    lojaDestino: '',
  })

  const [produtosData, setProdutosData] = useState<any[]>([])
  const [usuariosData, setUsuariosData] = useState<any[]>([])
  const [filtrosUsuarios, setFiltrosUsuarios] = useState({
    setor: '',
    status: '',
  })

  const [producaoData, setProducaoData] = useState<any[]>([])
  const [filtrosProducao, setFiltrosProducao] = useState({
    dataInicio: '',
    dataFim: '',
  })

  const [produtos, setProdutos] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [setores, setSetores] = useState<any[]>([])
  const [setoresMap, setSetoresMap] = useState<Record<string, string>>({})

  useEffect(() => {
    carregarDadosBasicos()
  }, [])

  async function carregarDadosBasicos() {
    const [{ data: prods }, { data: cats }, { data: setoresData }] = await Promise.all([
      supabase.from('produtos').select('id, nome').order('nome'),
      supabase.from('categorias').select('id, nome').order('nome'),
      supabase.from('setores').select('id, nome'),
    ])
    setProdutos(prods || [])
    setCategorias(cats || [])
    setSetores(setoresData || [])

    // Criar mapa de setor_id -> nome
    const mapa: Record<string, string> = {}
    setoresData?.forEach(s => {
      mapa[s.id] = s.nome
    })
    setSetoresMap(mapa)
  }

  // ===== RELATÓRIO 1: ESTOQUE POR UNIDADE (VISÃO ATUAL) =====
  async function carregarEstoque() {
    setLoading(true)
    try {
      const agora = new Date()
      setDataConsultaEstoque(agora.toLocaleString('pt-BR'))

      const { data: lotes } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome, categoria_id, unidade_medida, categoria:categorias(nome))')
        .eq('destino', filtrosEstoque.unidade)
        .in('status', ['na_loja', 'na_cozinha', 'em_estoque'])
        .order('produto_id')

      const agrupado: Record<string, any> = {}
      lotes?.forEach(lote => {
        const chave = lote.produto_id
        if (!agrupado[chave]) {
          agrupado[chave] = {
            produto_id: lote.produto_id,
            produto: lote.produto?.nome,
            categoria: lote.produto?.categoria?.nome || 'Sem categoria',
            unidade_medida: lote.produto?.unidade_medida,
            quantidade_total: 0,
            lotes: [],
          }
        }
        const qtd = lote.quantidade || lote.peso_gramas || 1
        agrupado[chave].quantidade_total += qtd
        agrupado[chave].lotes.push(lote)
      })

      setEstoqueData(Object.values(agrupado))
    } catch (error) {
      console.error('Erro ao carregar estoque:', error)
    }
    setLoading(false)
  }

  // ===== RELATÓRIO 2: MOVIMENTAÇÕES =====
  async function carregarMovimentacoes() {
    setLoading(true)
    try {
      const { data: lotes } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome)')
        .order('created_at', { ascending: false })

      const { data: movimentacoes } = await supabase
        .from('movimentacoes_estoque')
        .select('*')
        .order('created_at', { ascending: false })

      let resultado = (lotes || []).map(lote => ({
        lote_id: lote.id,
        codigo_qr: lote.codigo_qr,
        produto: lote.produto?.nome,
        status: lote.status,
        destino: lote.destino,
        data_criacao: lote.created_at,
        movimentacoes: (movimentacoes || []).filter(m => m.lote_id === lote.id),
      }))

      // Aplicar filtros
      if (filtrosMov.dataInicio) {
        resultado = resultado.filter(r => r.data_criacao >= filtrosMov.dataInicio)
      }
      if (filtrosMov.dataFim) {
        resultado = resultado.filter(r => r.data_criacao <= filtrosMov.dataFim)
      }
      if (filtrosMov.qrCode) {
        resultado = resultado.filter(r => r.codigo_qr?.includes(filtrosMov.qrCode))
      }
      if (filtrosMov.produto) {
        resultado = resultado.filter(r => r.produto === filtrosMov.produto)
      }
      if (filtrosMov.lojaDestino) {
        resultado = resultado.filter(r => r.destino === filtrosMov.lojaDestino)
      }

      setMovimentacaoData(resultado)
    } catch (error) {
      console.error('Erro ao carregar movimentações:', error)
    }
    setLoading(false)
  }

  // ===== RELATÓRIO 3: PRODUTOS =====
  async function carregarProdutos() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('produtos')
        .select('*, categoria:categorias(nome)')
        .order('nome')

      setProdutosData(data || [])
    } catch (error) {
      console.error('Erro ao carregar produtos:', error)
    }
    setLoading(false)
  }

  // ===== RELATÓRIO 4: USUÁRIOS =====
  async function carregarUsuarios() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false })

      let resultado = data || []

      if (filtrosUsuarios.setor) {
        resultado = resultado.filter(u => u.setor_id === filtrosUsuarios.setor)
      }
      if (filtrosUsuarios.status) {
        resultado = resultado.filter(u => (u.ativo ? 'ativo' : 'inativo') === filtrosUsuarios.status)
      }

      setUsuariosData(resultado)
    } catch (error) {
      console.error('Erro ao carregar usuários:', error)
    }
    setLoading(false)
  }

  // ===== RELATÓRIO 5: PRODUÇÃO (AGRUPADO POR PRODUTO) =====
  async function carregarProducao() {
    setLoading(true)
    try {
      const { data: lotes } = await supabase
        .from('lotes_producao')
        .select('*, produto:produtos(nome)')
        .order('created_at', { ascending: false })

      let resultado = lotes || []

      if (filtrosProducao.dataInicio) {
        resultado = resultado.filter(l => l.created_at >= filtrosProducao.dataInicio)
      }
      if (filtrosProducao.dataFim) {
        resultado = resultado.filter(l => l.created_at <= filtrosProducao.dataFim)
      }

      // Sempre agrupar por produto
      const agrupado: Record<string, any> = {}
      resultado.forEach(lote => {
        const produto = lote.produto?.nome || 'Desconhecido'
        if (!agrupado[produto]) {
          agrupado[produto] = {
            produto,
            total_lotes: 0,
            total_unidades: 0,
            datas: new Set(),
            produtores: new Set(),
          }
        }
        agrupado[produto].total_lotes += 1
        agrupado[produto].total_unidades += lote.quantidade || lote.peso_gramas || 1
        agrupado[produto].datas.add(lote.created_at.split('T')[0])
        if (lote.produzido_por) agrupado[produto].produtores.add(lote.produzido_por)
      })

      setProducaoData(
        Object.values(agrupado).map((item: any) => ({
          ...item,
          datas: Array.from(item.datas).join(', '),
          produtores: Array.from(item.produtores).join(', '),
        }))
      )
    } catch (error) {
      console.error('Erro ao carregar produção:', error)
    }
    setLoading(false)
  }

  function aplicarFiltros() {
    if (abaRelatorio === 'estoque') carregarEstoque()
    if (abaRelatorio === 'movimentacao') carregarMovimentacoes()
    if (abaRelatorio === 'produtos') carregarProdutos()
    if (abaRelatorio === 'usuarios') carregarUsuarios()
    if (abaRelatorio === 'producao') carregarProducao()
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
        {[
          { id: 'estoque', label: '📦 Estoque por Unidade' },
          { id: 'movimentacao', label: '🔄 Rastreabilidade' },
          { id: 'produtos', label: '📋 Produtos' },
          { id: 'usuarios', label: '👥 Usuários' },
          { id: 'producao', label: '🍳 Produção' },
        ].map(aba => (
          <button
            key={aba.id}
            onClick={() => setAbaRelatorio(aba.id as any)}
            className={`px-4 py-2 rounded-lg font-medium ${
              abaRelatorio === aba.id
                ? 'bg-pink-700 text-white'
                : 'bg-white text-gray-700 border border-gray-200'
            }`}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {/* Painel de Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-800">Filtros</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* ESTOQUE */}
          {abaRelatorio === 'estoque' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                <select
                  value={filtrosEstoque.unidade}
                  onChange={e => setFiltrosEstoque({ ...filtrosEstoque, unidade: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="cozinha">Cozinha</option>
                  <option value="loja1">Paraisópolis</option>
                  <option value="loja2">Itajubá</option>
                </select>
              </div>
            </>
          )}

          {/* MOVIMENTAÇÃO */}
          {abaRelatorio === 'movimentacao' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                <input
                  type="date"
                  value={filtrosMov.dataInicio}
                  onChange={e => setFiltrosMov({ ...filtrosMov, dataInicio: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                <input
                  type="date"
                  value={filtrosMov.dataFim}
                  onChange={e => setFiltrosMov({ ...filtrosMov, dataFim: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QR Code</label>
                <input
                  type="text"
                  placeholder="Filtrar por QR"
                  value={filtrosMov.qrCode}
                  onChange={e => setFiltrosMov({ ...filtrosMov, qrCode: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
                <select
                  value={filtrosMov.produto}
                  onChange={e => setFiltrosMov({ ...filtrosMov, produto: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todos</option>
                  {produtos.map(p => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* USUÁRIOS */}
          {abaRelatorio === 'usuarios' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
                <input
                  type="text"
                  placeholder="Filtrar setor"
                  value={filtrosUsuarios.setor}
                  onChange={e => setFiltrosUsuarios({ ...filtrosUsuarios, setor: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filtrosUsuarios.status}
                  onChange={e => setFiltrosUsuarios({ ...filtrosUsuarios, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todos</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </>
          )}

          {/* PRODUÇÃO */}
          {abaRelatorio === 'producao' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                <input
                  type="date"
                  value={filtrosProducao.dataInicio}
                  onChange={e => setFiltrosProducao({ ...filtrosProducao, dataInicio: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                <input
                  type="date"
                  value={filtrosProducao.dataFim}
                  onChange={e => setFiltrosProducao({ ...filtrosProducao, dataFim: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={aplicarFiltros}
            disabled={loading}
            className="flex items-center gap-2 bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-pink-800 disabled:opacity-50"
          >
            <Filter size={16} /> {loading ? 'Carregando...' : 'Aplicar Filtros'}
          </button>
        </div>
      </div>

      {/* ===== RELATÓRIO 1: ESTOQUE ===== */}
      {abaRelatorio === 'estoque' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Posição de Estoque ({estoqueData.length})
              </h3>
              {dataConsultaEstoque && (
                <p className="text-xs text-gray-500 mt-1">Consultado em: {dataConsultaEstoque}</p>
              )}
            </div>
            <button
              onClick={() => {
                const headers = ['produto', 'categoria', 'unidade_medida', 'quantidade_total', 'lotes']
                const dados = estoqueData.map(e => ({
                  produto: e.produto,
                  categoria: e.categoria,
                  unidade_medida: e.unidade_medida,
                  quantidade_total: e.quantidade_total,
                  lotes: e.lotes.length,
                }))
                exportarCSV(dados, headers, 'relatorio-estoque')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">Categoria</th>
                  <th className="px-4 py-2 text-left">Un. Medida</th>
                  <th className="px-4 py-2 text-center">Qtd Disponível</th>
                  <th className="px-4 py-2 text-left">Data Validade (Próxima)</th>
                </tr>
              </thead>
              <tbody>
                {estoqueData.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{item.produto}</td>
                    <td className="px-4 py-2">{item.categoria}</td>
                    <td className="px-4 py-2">{item.unidade_medida}</td>
                    <td className="px-4 py-2 text-center font-semibold text-blue-600">{item.quantidade_total}</td>
                    <td className="px-4 py-2 text-xs">
                      {item.lotes.length > 0
                        ? new Date(
                            Math.min(...item.lotes.map((l: any) => new Date(l.data_validade).getTime()))
                          ).toLocaleDateString('pt-BR')
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {estoqueData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhum produto encontrado</div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 2: RASTREABILIDADE ===== */}
      {abaRelatorio === 'movimentacao' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Rastreabilidade de Etiquetas ({movimentacaoData.length})
            </h3>
            <button
              onClick={() => {
                const headers = ['codigo_qr', 'produto', 'status', 'destino', 'data_criacao']
                const dados = movimentacaoData.map(m => ({
                  codigo_qr: m.codigo_qr,
                  produto: m.produto,
                  status: m.status,
                  destino: m.destino,
                  data_criacao: new Date(m.data_criacao).toLocaleString('pt-BR'),
                }))
                exportarCSV(dados, headers, 'relatorio-rastreabilidade')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">QR Code</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Destino</th>
                  <th className="px-4 py-2 text-left">Data Criação</th>
                  <th className="px-4 py-2 text-center">Movimentações</th>
                </tr>
              </thead>
              <tbody>
                {movimentacaoData.map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{item.codigo_qr}</td>
                    <td className="px-4 py-2">{item.produto}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">{LOCAL_LABEL[item.destino] || item.destino}</td>
                    <td className="px-4 py-2 text-xs">{new Date(item.data_criacao).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => setExpandedRows({ ...expandedRows, [idx]: !expandedRows[idx] })}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ChevronDown size={16} className={expandedRows[idx] ? 'rotate-180' : ''} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movimentacaoData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhuma movimentação encontrada</div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 3: PRODUTOS ===== */}
      {abaRelatorio === 'produtos' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Produtos Cadastrados ({produtosData.length})
            </h3>
            <button
              onClick={() => {
                const headers = ['nome', 'categoria', 'tipo', 'unidade_medida', 'validade_dias', 'fatias_porcoes', 'status']
                const dados = produtosData.map(p => ({
                  nome: p.nome,
                  categoria: p.categoria?.nome || 'Sem categoria',
                  tipo: p.tipo,
                  unidade_medida: p.unidade_medida,
                  validade_dias: p.validade_dias,
                  fatias_porcoes: p.fatias_porcoes || '-',
                  status: p.ativo ? 'Ativo' : 'Inativo',
                }))
                exportarCSV(dados, headers, 'relatorio-produtos')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Nome</th>
                  <th className="px-4 py-2 text-left">Categoria</th>
                  <th className="px-4 py-2 text-left">Tipo</th>
                  <th className="px-4 py-2 text-left">Unidade</th>
                  <th className="px-4 py-2 text-center">Validade (dias)</th>
                  <th className="px-4 py-2 text-center">Congelado</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {produtosData.map((p, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{p.nome}</td>
                    <td className="px-4 py-2">{p.categoria?.nome || 'Sem categoria'}</td>
                    <td className="px-4 py-2">{p.tipo}</td>
                    <td className="px-4 py-2">{p.unidade_medida}</td>
                    <td className="px-4 py-2 text-center">{p.validade_dias}</td>
                    <td className="px-4 py-2 text-center">{p.congelado ? '❄️' : '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        p.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {produtosData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhum produto encontrado</div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 4: USUÁRIOS ===== */}
      {abaRelatorio === 'usuarios' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Usuários Cadastrados ({usuariosData.length})
            </h3>
            <button
              onClick={() => {
                const headers = ['nome', 'email', 'role', 'setor_id', 'status', 'created_at']
                const dados = usuariosData.map(u => ({
                  nome: u.nome,
                  email: u.email,
                  role: u.role,
                  setor_id: u.setor_id || '-',
                  status: u.ativo ? 'Ativo' : 'Inativo',
                  created_at: new Date(u.created_at).toLocaleDateString('pt-BR'),
                }))
                exportarCSV(dados, headers, 'relatorio-usuarios')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Nome</th>
                  <th className="px-4 py-2 text-left">E-mail</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Setor</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-left">Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {usuariosData.map((u, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{u.nome}</td>
                    <td className="px-4 py-2 text-xs">{u.email}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">{u.setor_id ? setoresMap[u.setor_id] || u.setor_id : '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usuariosData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhum usuário encontrado</div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 5: PRODUÇÃO (AGRUPADO POR PRODUTO) ===== */}
      {abaRelatorio === 'producao' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Produção da Cozinha ({producaoData.length}) - Por Produto
            </h3>
            <button
              onClick={() => {
                const headers = ['produto', 'total_lotes', 'total_unidades', 'datas', 'produtores']
                exportarCSV(producaoData, headers, 'relatorio-producao')
              }}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
            >
              <Download size={16} /> Exportar CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-center">Qtd Lotes</th>
                  <th className="px-4 py-2 text-center">Total Unidades</th>
                  <th className="px-4 py-2 text-left">Período</th>
                  <th className="px-4 py-2 text-left">Produtores</th>
                </tr>
              </thead>
              <tbody>
                {producaoData.map((p, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{p.produto}</td>
                    <td className="px-4 py-2 text-center font-semibold text-blue-600">{p.total_lotes}</td>
                    <td className="px-4 py-2 text-center font-semibold text-green-600">{p.total_unidades}</td>
                    <td className="px-4 py-2 text-xs">{p.datas}</td>
                    <td className="px-4 py-2 text-xs">{p.produtores || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {producaoData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhuma produção encontrada</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
