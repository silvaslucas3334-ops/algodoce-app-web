'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { Download, Filter } from 'lucide-react'

// ordens_producao.hora_inicio_prod e outras colunas "timestamp without time zone"
// guardam instantes UTC sem sufixo de fuso; sem isso o Date do JS interpreta
// como horário local do navegador, deslocando o valor (mesmo bug corrigido
// na timeline de rastreabilidade de ordens).
function parseUTC(raw: string): string {
  const temFuso = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
  return new Date(temFuso ? raw : `${raw}Z`).toISOString()
}

function primeiroDiaDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

function hoje() {
  return new Date().toISOString().split('T')[0]
}

export default function RelatoriosTab() {
  const [abaRelatorio, setAbaRelatorio] = useState<'producao' | 'baixas' | 'estoque'>('producao')
  const [loading, setLoading] = useState(false)

  const [produtos, setProdutos] = useState<any[]>([])

  useEffect(() => {
    supabase.from('produtos').select('id, nome').order('nome').then(({ data }) => setProdutos(data || []))
  }, [])

  // ===================================================================
  // RELATÓRIO 1: PRODUÇÃO — o que foi produzido e quanto tempo levou
  // (hora_inicio_prod da ordem -> hora_fim_prod dos lotes, por ordem)
  // ===================================================================
  const [filtrosProducao, setFiltrosProducao] = useState({
    dataInicio: primeiroDiaDoMes(),
    dataFim: hoje(),
    produto: '',
    unidade: '',
  })
  const [producaoData, setProducaoData] = useState<any[]>([])

  async function carregarProducao() {
    setLoading(true)
    try {
      const { data: lotes } = await supabase
        .from('lotes_producao')
        .select(
          'id, quantidade, peso_gramas, hora_fim_prod, produzido_por, destino, ordem_id, ordem:ordens_producao(numero_ordem, hora_inicio_prod, loja_destino, produto:produtos(nome, unidade_medida))'
        )
        .gte('hora_fim_prod', `${filtrosProducao.dataInicio}T00:00:00`)
        .lte('hora_fim_prod', `${filtrosProducao.dataFim}T23:59:59`)
        .order('hora_fim_prod', { ascending: false })

      // Agrupar por ordem: uma ordem gera vários lotes/etiquetas ao mesmo tempo
      const agrupado = new Map<string, any>()
      ;(lotes || []).forEach((lote: any) => {
        if (filtrosProducao.produto && lote.ordem?.produto?.nome !== filtrosProducao.produto) return
        if (filtrosProducao.unidade && lote.destino !== filtrosProducao.unidade) return

        const chave = lote.ordem_id || lote.id
        if (!agrupado.has(chave)) {
          agrupado.set(chave, {
            numero_ordem: lote.ordem?.numero_ordem,
            produto: lote.ordem?.produto?.nome || 'Desconhecido',
            unidade_medida: lote.ordem?.produto?.unidade_medida || 'un',
            destino: lote.destino,
            produzido_por: lote.produzido_por,
            hora_inicio_prod: lote.ordem?.hora_inicio_prod,
            hora_fim_prod: lote.hora_fim_prod,
            quantidade: 0,
            etiquetas: 0,
          })
        }
        const item = agrupado.get(chave)
        item.quantidade += lote.quantidade || lote.peso_gramas || 0
        item.etiquetas += 1
        // Conclusão = etiqueta mais recente do grupo
        if (new Date(lote.hora_fim_prod) > new Date(item.hora_fim_prod)) {
          item.hora_fim_prod = lote.hora_fim_prod
        }
      })

      const resultado = Array.from(agrupado.values()).map((item) => {
        let duracaoMin: number | null = null
        if (item.hora_inicio_prod && item.hora_fim_prod) {
          const inicio = new Date(parseUTC(item.hora_inicio_prod)).getTime()
          const fim = new Date(item.hora_fim_prod).getTime() // já é timestamptz, sem bug de fuso
          duracaoMin = Math.max(0, Math.round((fim - inicio) / 60000))
        }
        return { ...item, duracaoMin }
      })

      resultado.sort((a, b) => new Date(b.hora_fim_prod).getTime() - new Date(a.hora_fim_prod).getTime())
      setProducaoData(resultado)
    } catch (error) {
      console.error('Erro ao carregar produção:', error)
    }
    setLoading(false)
  }

  function formatarDuracao(min: number | null) {
    if (min === null) return '-'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m > 0 ? `${h}h ${m}min` : `${h}h`
  }

  // ===================================================================
  // RELATÓRIO 2: BAIXAS + PRODUZIDO x CONSUMIDO
  // ===================================================================
  const [filtrosBaixas, setFiltrosBaixas] = useState({
    dataInicio: primeiroDiaDoMes(),
    dataFim: hoje(),
    unidade: '',
    produto: '',
  })
  const [baixasData, setBaixasData] = useState<any[]>([])
  const [comparativoData, setComparativoData] = useState<any[]>([])

  async function carregarBaixas() {
    setLoading(true)
    try {
      const inicioIso = `${filtrosBaixas.dataInicio}T00:00:00`
      const fimIso = `${filtrosBaixas.dataFim}T23:59:59`

      // --- Baixas (tabela filtrável, para comparar com relatório de vendas) ---
      let queryBaixas = supabase
        .from('movimentacoes_estoque')
        .select(
          'id, lote_id, quantidade, local_origem, registrado_por, created_at, estornado_de, lote:lotes_producao(codigo_qr, produto_id, produto:produtos(nome, unidade_medida))'
        )
        .eq('tipo', 'saida')
        .gte('created_at', inicioIso)
        .lte('created_at', fimIso)
        .order('created_at', { ascending: false })

      if (filtrosBaixas.unidade) queryBaixas = queryBaixas.eq('local_origem', filtrosBaixas.unidade)

      const { data: baixas } = await queryBaixas

      // Marcar quais já foram revertidas (não contam como consumo real)
      const idsBaixas = (baixas || []).map((b: any) => b.id)
      const revertidas = new Set<string>()
      if (idsBaixas.length > 0) {
        const { data: reversoes } = await supabase
          .from('movimentacoes_estoque')
          .select('estornado_de')
          .in('estornado_de', idsBaixas)
        reversoes?.forEach((r: any) => revertidas.add(r.estornado_de))
      }

      let baixasProcessadas = (baixas || []).map((b: any) => ({
        ...b,
        produto: b.lote?.produto?.nome || 'Desconhecido',
        unidade_medida: b.lote?.produto?.unidade_medida || 'un',
        revertida: revertidas.has(b.id),
      }))

      if (filtrosBaixas.produto) {
        baixasProcessadas = baixasProcessadas.filter((b: any) => b.produto === filtrosBaixas.produto)
      }

      setBaixasData(baixasProcessadas)

      // --- Comparativo: produzido (para a unidade) x consumido (baixas não revertidas) ---
      let queryLotes = supabase
        .from('lotes_producao')
        .select('quantidade, peso_gramas, destino, produto_id, produto:produtos(nome, unidade_medida)')
        .gte('created_at', inicioIso)
        .lte('created_at', fimIso)

      if (filtrosBaixas.unidade) queryLotes = queryLotes.eq('destino', filtrosBaixas.unidade)

      const { data: lotesProduzidos } = await queryLotes

      const chave = (produto: string, unidade: string) => `${produto}::${unidade}`
      const comparativo = new Map<string, any>()

      ;(lotesProduzidos || []).forEach((l: any) => {
        const nomeProduto = l.produto?.nome || 'Desconhecido'
        if (filtrosBaixas.produto && nomeProduto !== filtrosBaixas.produto) return
        const k = chave(nomeProduto, l.destino)
        if (!comparativo.has(k)) {
          comparativo.set(k, {
            produto: nomeProduto,
            unidade: l.destino,
            unidade_medida: l.produto?.unidade_medida || 'un',
            produzido: 0,
            consumido: 0,
          })
        }
        comparativo.get(k).produzido += l.quantidade || l.peso_gramas || 0
      })

      baixasProcessadas
        .filter((b: any) => !b.revertida)
        .forEach((b: any) => {
          const k = chave(b.produto, b.local_origem)
          if (!comparativo.has(k)) {
            comparativo.set(k, {
              produto: b.produto,
              unidade: b.local_origem,
              unidade_medida: b.unidade_medida,
              produzido: 0,
              consumido: 0,
            })
          }
          comparativo.get(k).consumido += b.quantidade || 0
        })

      const comparativoFinal = Array.from(comparativo.values())
        .map((c) => ({ ...c, diferenca: c.produzido - c.consumido }))
        .sort((a, b) => a.produto.localeCompare(b.produto))

      setComparativoData(comparativoFinal)
    } catch (error) {
      console.error('Erro ao carregar baixas:', error)
    }
    setLoading(false)
  }

  // ===================================================================
  // RELATÓRIO 3: POSIÇÃO DE ESTOQUE (estático, por categoria e por item)
  // ===================================================================
  const [filtrosEstoque, setFiltrosEstoque] = useState({ unidade: 'cozinha' })
  const [visaoEstoque, setVisaoEstoque] = useState<'categoria' | 'item'>('item')
  const [estoqueData, setEstoqueData] = useState<any[]>([])
  const [dataConsultaEstoque, setDataConsultaEstoque] = useState('')

  async function carregarEstoque() {
    setLoading(true)
    try {
      setDataConsultaEstoque(new Date().toLocaleString('pt-BR'))

      let query = supabase
        .from('lotes_producao')
        .select('quantidade, peso_gramas, destino, produto:produtos(nome, categoria_id, unidade_medida, categoria:categorias(nome))')
        .in('status', ['na_loja', 'na_cozinha', 'em_estoque'])

      if (filtrosEstoque.unidade) query = query.eq('destino', filtrosEstoque.unidade)

      const { data: lotes } = await query

      const porItem = new Map<string, any>()
      ;(lotes || []).forEach((lote: any) => {
        const nomeProduto = lote.produto?.nome || 'Desconhecido'
        if (!porItem.has(nomeProduto)) {
          porItem.set(nomeProduto, {
            produto: nomeProduto,
            categoria: lote.produto?.categoria?.nome || 'Sem categoria',
            unidade_medida: lote.produto?.unidade_medida || 'un',
            quantidade_total: 0,
            contador: 0,
          })
        }
        const item = porItem.get(nomeProduto)
        item.quantidade_total += lote.quantidade || lote.peso_gramas || 0
        item.contador += 1
      })

      setEstoqueData(Array.from(porItem.values()).sort((a, b) => a.produto.localeCompare(b.produto)))
    } catch (error) {
      console.error('Erro ao carregar estoque:', error)
    }
    setLoading(false)
  }

  const estoquePorCategoria = Array.from(
    estoqueData
      .reduce((mapa, item) => {
        if (!mapa.has(item.categoria)) {
          mapa.set(item.categoria, { categoria: item.categoria, quantidade_total: 0, itens: 0 })
        }
        const c = mapa.get(item.categoria)
        c.quantidade_total += item.quantidade_total
        c.itens += 1
        return mapa
      }, new Map<string, any>())
      .values()
  ).sort((a: any, b: any) => a.categoria.localeCompare(b.categoria))

  useEffect(() => {
    if (abaRelatorio === 'producao') carregarProducao()
    if (abaRelatorio === 'baixas') carregarBaixas()
    if (abaRelatorio === 'estoque') carregarEstoque()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaRelatorio])

  function aplicarFiltros() {
    if (abaRelatorio === 'producao') carregarProducao()
    if (abaRelatorio === 'baixas') carregarBaixas()
    if (abaRelatorio === 'estoque') carregarEstoque()
  }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Relatórios</h2>
      </div>

      {/* Abas */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { id: 'producao', label: '🍳 Produção' },
          { id: 'baixas', label: '📉 Baixas & Consumo' },
          { id: 'estoque', label: '📦 Posição de Estoque' },
        ].map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaRelatorio(aba.id as any)}
            className={`px-4 py-2 rounded-lg font-medium ${
              abaRelatorio === aba.id ? 'bg-pink-700 text-white' : 'bg-white text-gray-700 border border-gray-200'
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
          {abaRelatorio === 'producao' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                <input
                  type="date"
                  value={filtrosProducao.dataInicio}
                  onChange={(e) => setFiltrosProducao({ ...filtrosProducao, dataInicio: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                <input
                  type="date"
                  value={filtrosProducao.dataFim}
                  onChange={(e) => setFiltrosProducao({ ...filtrosProducao, dataFim: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
                <select
                  value={filtrosProducao.produto}
                  onChange={(e) => setFiltrosProducao({ ...filtrosProducao, produto: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todos</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                <select
                  value={filtrosProducao.unidade}
                  onChange={(e) => setFiltrosProducao({ ...filtrosProducao, unidade: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todas</option>
                  <option value="cozinha">Cozinha</option>
                  <option value="loja1">Paraisópolis</option>
                  <option value="loja2">Itajubá</option>
                </select>
              </div>
            </>
          )}

          {abaRelatorio === 'baixas' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                <input
                  type="date"
                  value={filtrosBaixas.dataInicio}
                  onChange={(e) => setFiltrosBaixas({ ...filtrosBaixas, dataInicio: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                <input
                  type="date"
                  value={filtrosBaixas.dataFim}
                  onChange={(e) => setFiltrosBaixas({ ...filtrosBaixas, dataFim: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                <select
                  value={filtrosBaixas.unidade}
                  onChange={(e) => setFiltrosBaixas({ ...filtrosBaixas, unidade: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todas</option>
                  <option value="cozinha">Cozinha</option>
                  <option value="loja1">Paraisópolis</option>
                  <option value="loja2">Itajubá</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
                <select
                  value={filtrosBaixas.produto}
                  onChange={(e) => setFiltrosBaixas({ ...filtrosBaixas, produto: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  <option value="">Todos</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.nome}>{p.nome}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {abaRelatorio === 'estoque' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
              <select
                value={filtrosEstoque.unidade}
                onChange={(e) => setFiltrosEstoque({ ...filtrosEstoque, unidade: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Todas</option>
                <option value="cozinha">Cozinha</option>
                <option value="loja1">Paraisópolis</option>
                <option value="loja2">Itajubá</option>
              </select>
            </div>
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

      {/* ===== RELATÓRIO 1: PRODUÇÃO ===== */}
      {abaRelatorio === 'producao' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Produção da Cozinha ({producaoData.length} ordem{producaoData.length !== 1 ? 's' : ''})
            </h3>
            <button
              onClick={() => {
                const headers = ['numero_ordem', 'produto', 'destino', 'quantidade', 'etiquetas', 'produzido_por', 'duracaoMin']
                exportarCSV(
                  producaoData.map((p) => ({ ...p, destino: LOCAL_LABEL[p.destino] || p.destino })),
                  headers,
                  'relatorio-producao'
                )
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
                  <th className="px-4 py-2 text-left">Ordem</th>
                  <th className="px-4 py-2 text-left">Produto</th>
                  <th className="px-4 py-2 text-left">Destino</th>
                  <th className="px-4 py-2 text-center">Qtd</th>
                  <th className="px-4 py-2 text-center">Etiquetas</th>
                  <th className="px-4 py-2 text-left">Início</th>
                  <th className="px-4 py-2 text-left">Conclusão</th>
                  <th className="px-4 py-2 text-center">Duração</th>
                  <th className="px-4 py-2 text-left">Produzido por</th>
                </tr>
              </thead>
              <tbody>
                {producaoData.map((p, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">#{p.numero_ordem}</td>
                    <td className="px-4 py-2 font-medium">{p.produto}</td>
                    <td className="px-4 py-2">{LOCAL_LABEL[p.destino] || p.destino}</td>
                    <td className="px-4 py-2 text-center font-semibold text-blue-600">
                      {p.quantidade} {p.unidade_medida}
                    </td>
                    <td className="px-4 py-2 text-center">{p.etiquetas}</td>
                    <td className="px-4 py-2 text-xs">
                      {p.hora_inicio_prod ? new Date(parseUTC(p.hora_inicio_prod)).toLocaleString('pt-BR') : '-'}
                    </td>
                    <td className="px-4 py-2 text-xs">{new Date(p.hora_fim_prod).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-center font-semibold text-purple-700">
                      {formatarDuracao(p.duracaoMin)}
                    </td>
                    <td className="px-4 py-2 text-xs">{p.produzido_por || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {producaoData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhuma produção encontrada no período</div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 2: BAIXAS & CONSUMO ===== */}
      {abaRelatorio === 'baixas' && (
        <div className="space-y-6">
          {/* Comparativo produzido x consumido */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Produzido x Consumido (no período)</h3>
              <button
                onClick={() => {
                  const headers = ['produto', 'unidade', 'produzido', 'consumido', 'diferenca']
                  exportarCSV(
                    comparativoData.map((c) => ({ ...c, unidade: LOCAL_LABEL[c.unidade] || c.unidade })),
                    headers,
                    'relatorio-produzido-consumido'
                  )
                }}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
              >
                <Download size={16} /> Exportar CSV
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Consumido = baixas não revertidas no período. Diferença positiva indica sobra de produção; negativa indica que se vendeu mais do que foi produzido nesse recorte (pode ter vindo de estoque anterior).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">Produto</th>
                    <th className="px-4 py-2 text-left">Unidade</th>
                    <th className="px-4 py-2 text-center">Produzido</th>
                    <th className="px-4 py-2 text-center">Consumido</th>
                    <th className="px-4 py-2 text-center">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativoData.map((c, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{c.produto}</td>
                      <td className="px-4 py-2">{LOCAL_LABEL[c.unidade] || c.unidade}</td>
                      <td className="px-4 py-2 text-center text-blue-600 font-semibold">
                        {c.produzido} {c.unidade_medida}
                      </td>
                      <td className="px-4 py-2 text-center text-red-600 font-semibold">
                        {c.consumido} {c.unidade_medida}
                      </td>
                      <td className={`px-4 py-2 text-center font-semibold ${c.diferenca < 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {c.diferenca > 0 ? '+' : ''}{c.diferenca}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {comparativoData.length === 0 && (
                <div className="text-center py-8 text-gray-400">Nenhum dado no período</div>
              )}
            </div>
          </div>

          {/* Tabela de baixas individuais */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">
                Baixas ({baixasData.length}) — para comparar com o relatório de vendas
              </h3>
              <button
                onClick={() => {
                  const headers = ['produto', 'unidade', 'quantidade', 'registrado_por', 'created_at', 'revertida']
                  exportarCSV(
                    baixasData.map((b) => ({
                      produto: b.produto,
                      unidade: LOCAL_LABEL[b.local_origem] || b.local_origem,
                      quantidade: b.quantidade,
                      registrado_por: b.registrado_por,
                      created_at: new Date(b.created_at).toLocaleString('pt-BR'),
                      revertida: b.revertida ? 'Sim' : 'Não',
                    })),
                    headers,
                    'relatorio-baixas'
                  )
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
                    <th className="px-4 py-2 text-left">Unidade</th>
                    <th className="px-4 py-2 text-center">Qtd</th>
                    <th className="px-4 py-2 text-left">Operador</th>
                    <th className="px-4 py-2 text-left">Data/Hora</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {baixasData.map((b, idx) => (
                    <tr key={idx} className={`border-b hover:bg-gray-50 ${b.revertida ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2 font-medium">{b.produto}</td>
                      <td className="px-4 py-2">{LOCAL_LABEL[b.local_origem] || b.local_origem}</td>
                      <td className="px-4 py-2 text-center">{b.quantidade} {b.unidade_medida}</td>
                      <td className="px-4 py-2">{b.registrado_por}</td>
                      <td className="px-4 py-2 text-xs">{new Date(b.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-2 text-center">
                        {b.revertida ? (
                          <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500">
                            Revertida
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
                            Consumida
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {baixasData.length === 0 && (
                <div className="text-center py-8 text-gray-400">Nenhuma baixa encontrada no período</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== RELATÓRIO 3: POSIÇÃO DE ESTOQUE ===== */}
      {abaRelatorio === 'estoque' && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Posição de Estoque {filtrosEstoque.unidade ? `— ${LOCAL_LABEL[filtrosEstoque.unidade]}` : '— Todas as unidades'}
              </h3>
              {dataConsultaEstoque && (
                <p className="text-xs text-gray-500 mt-1">Consultado em: {dataConsultaEstoque}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setVisaoEstoque('item')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${visaoEstoque === 'item' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  Por Item
                </button>
                <button
                  onClick={() => setVisaoEstoque('categoria')}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${visaoEstoque === 'categoria' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                >
                  Por Categoria
                </button>
              </div>
              <button
                onClick={() => {
                  if (visaoEstoque === 'item') {
                    exportarCSV(estoqueData, ['produto', 'categoria', 'unidade_medida', 'quantidade_total', 'contador'], 'relatorio-estoque-por-item')
                  } else {
                    exportarCSV(estoquePorCategoria, ['categoria', 'quantidade_total', 'itens'], 'relatorio-estoque-por-categoria')
                  }
                }}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
              >
                <Download size={16} /> Exportar CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {visaoEstoque === 'item' ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">Produto</th>
                    <th className="px-4 py-2 text-left">Categoria</th>
                    <th className="px-4 py-2 text-left">Un. Medida</th>
                    <th className="px-4 py-2 text-center">Qtd Disponível</th>
                    <th className="px-4 py-2 text-center">Etiquetas</th>
                  </tr>
                </thead>
                <tbody>
                  {estoqueData.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{item.produto}</td>
                      <td className="px-4 py-2">{item.categoria}</td>
                      <td className="px-4 py-2">{item.unidade_medida}</td>
                      <td className="px-4 py-2 text-center font-semibold text-blue-600">{item.quantidade_total}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{item.contador}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">Categoria</th>
                    <th className="px-4 py-2 text-center">Qtd Total</th>
                    <th className="px-4 py-2 text-center">Itens Diferentes</th>
                  </tr>
                </thead>
                <tbody>
                  {estoquePorCategoria.map((cat: any, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{cat.categoria}</td>
                      <td className="px-4 py-2 text-center font-semibold text-blue-600">{cat.quantidade_total}</td>
                      <td className="px-4 py-2 text-center text-gray-500">{cat.itens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {estoqueData.length === 0 && (
              <div className="text-center py-8 text-gray-400">Nenhum produto encontrado</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
