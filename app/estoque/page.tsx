'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { exportarCSV } from '@/lib/csv-export'
import { ShoppingCart, Trash2, Send, History, RotateCcw, ChevronDown, Download } from 'lucide-react'
import OluquinhasLogo from '@/components/OluquinhasLogo'

export default function EstoquePage() {
  const { usuario } = useAuth()
  const [local, setLocal] = useState<string>(() => {
    if (usuario?.role === 'loja' && usuario?.loja_id) {
      return usuario.loja_id
    }
    return 'cozinha'
  })
  const [lotes, setLotes] = useState<any[]>([])
  const [lojesPendentes, setLojesPendentes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [carrinho, setCarrinho] = useState<string[]>([])
  const [destinoEnvio, setDestinoEnvio] = useState('loja1')
  const [operador, setOperador] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modoEnvio, setModoEnvio] = useState(false)
  const [modoRecebimento, setModoRecebimento] = useState(false)
  const [carrinhoRecebimento, setCarrinhoRecebimento] = useState<string[]>([])
  const [confirmarRecebimento, setConfirmarRecebimento] = useState(false)
  const [modoBaixa, setModoBaixa] = useState(false)
  const [carrinhoBaixa, setCarrinhoBaixa] = useState<string[]>([])
  const [confirmarBaixa, setConfirmarBaixa] = useState(false)
  const [modoBaixaConsumo, setModoBaixaConsumo] = useState(false)
  const [carrinhoBaixaConsumo, setCarrinhoBaixaConsumo] = useState<string[]>([])
  const [confirmarBaixaConsumo, setConfirmarBaixaConsumo] = useState(false)
  const [produtosExpandidos, setProdutosExpandidos] = useState<Record<string, boolean>>({})
  const [mostrarRecebimento, setMostrarRecebimento] = useState(false)
  const [mostrarHistoricoBaixas, setMostrarHistoricoBaixas] = useState(false)
  const [baixasRecentes, setBaixasRecentes] = useState<any[]>([])
  const [carregandoBaixas, setCarregandoBaixas] = useState(false)
  const [revertendoId, setRevertendoId] = useState<string | null>(null)
  const [justificativaTexto, setJustificativaTexto] = useState('')
  const [salvandoReversao, setSalvandoReversao] = useState(false)
  const [buscaEtiqueta, setBuscaEtiqueta] = useState('')
  const [resultadoBusca, setResultadoBusca] = useState<any[] | null>(null)
  const [buscandoEtiqueta, setBuscandoEtiqueta] = useState(false)
  const [mostrarMenuAcoes, setMostrarMenuAcoes] = useState(false)
  const [mostrarModalReverter, setMostrarModalReverter] = useState(false)
  const [mostrarModalRelatorio, setMostrarModalRelatorio] = useState(false)
  const [visaoRelatorio, setVisaoRelatorio] = useState<'item' | 'categoria'>('item')
  const [unidadeRelatorio, setUnidadeRelatorio] = useState('cozinha')
  const [relatorioData, setRelatorioData] = useState<any[]>([])
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false)

  // Sincronizar local quando usuário muda
  useEffect(() => {
    if (usuario?.role === 'loja' && usuario?.loja_id) {
      setLocal(usuario.loja_id)
    } else {
      setLocal('cozinha')
    }
    // Preencher operador com nome do usuário
    if (usuario?.nome) {
      setOperador(usuario.nome)
    }
  }, [usuario?.role, usuario?.loja_id, usuario?.nome])

  useEffect(() => {
    carregarEstoque()

    const channel = supabase
      .channel(`estoque-${local}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotes_producao' }, carregarEstoque)
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [local])

  useEffect(() => {
    if (mostrarModalRelatorio) carregarRelatorioGerencial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarModalRelatorio, unidadeRelatorio])

  async function carregarEstoque() {
    setLoading(true)
    setCarrinho([])
    setModoEnvio(false)

    let query = supabase
      .from('lotes_producao')
      .select('id, codigo_qr, produto_id, ordem_id, quantidade, peso_gramas, data_producao, data_validade, produzido_por, destino, status, produto:produtos(nome, tipo, categoria:categorias(nome), unidade_medida, congelado), ordem:ordens_producao(numero_ordem, data_entrega, loja_destino, tipo_ordem)')

    // Filtrar por local (onde está agora)
    if (local === 'cozinha') {
      query = query.eq('status', 'na_cozinha')
    } else {
      // Para lojas, filtrar por destino e status
      query = query.eq('destino', local).in('status', ['enviado', 'na_loja'])
    }

    const { data, error } = await query.order('data_validade')

    if (error) console.error('Erro ao carregar estoque:', error)
    setLotes(data || [])

    // Para usuários de loja, carregar pendentes de recebimento
    if (usuario?.role === 'loja' && usuario?.loja_id) {
      const { data: pendentes } = await supabase
        .from('lotes_producao')
        .select('id, codigo_qr, produto_id, quantidade, peso_gramas, data_validade, produzido_por, status, produto:produtos(nome, unidade_medida, congelado)')
        .eq('destino', usuario.loja_id)
        .eq('status', 'enviado')
        .order('data_validade')

      setLojesPendentes(pendentes || [])
    }

    setLoading(false)
  }

  const hoje = new Date().toISOString().split('T')[0]
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

  function validadeColor(data: string) {
    if (data < hoje) return 'text-red-600 font-bold'
    if (data <= em3dias) return 'text-amber-600 font-semibold'
    return 'text-gray-500'
  }

  // Agrupar lotes por produto e ordem
  const lotesAgrupados = lotes.reduce((acc: any, lote: any) => {
    const chave = `${lote.produto_id}-${lote.ordem_id}`
    if (!acc[chave]) {
      acc[chave] = {
        id: chave,
        lote_ids: [],
        produto: lote.produto,
        ordem: lote.ordem,
        quantidade_total: 0,
        peso_total: 0,
        data_validade_menor: lote.data_validade,
        data_producao: lote.data_producao,
        produzido_por: lote.produzido_por,
      }
    }
    acc[chave].lote_ids.push(lote.id)
    // Para Gramas, somar peso_gramas; para outros, somar quantidade
    if (lote.produto?.unidade_medida === 'Gramas') {
      acc[chave].peso_total += lote.peso_gramas || 0
    } else {
      acc[chave].quantidade_total += lote.quantidade
    }
    if (lote.data_validade < acc[chave].data_validade_menor) {
      acc[chave].data_validade_menor = lote.data_validade
    }
    return acc
  }, {} as Record<string, any>)

  const lotesAgrupList = Object.values(lotesAgrupados)

  const relatorioPorCategoria = Array.from(
    relatorioData
      .reduce((mapa: Map<string, any>, item: any) => {
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

  function toggleCarrinho(loteId: string) {
    setCarrinho(prev => {
      if (prev.includes(loteId)) {
        return prev.filter(id => id !== loteId)
      } else {
        return [...prev, loteId]
      }
    })
  }

  // DESCONTINUADO: criarEnvio foi removido. Use o módulo de Romaneios (Expedição) para envios.
  // async function criarEnvio() {
  //   if (carrinho.length === 0 || !operador) return
  //   setEnviando(true)
  //   await supabase.from('lotes_producao')
  //     .update({ status: 'enviado', destino: destinoEnvio })
  //     .in('id', carrinho)
  //   await supabase.from('movimentacoes_estoque').insert(
  //     carrinho.map((id: any) => ({
  //       lote_id: id,
  //       tipo: 'transferencia',
  //       local_origem: local,
  //       local_destino: destinoEnvio,
  //       quantidade: 1,
  //       registrado_por: operador,
  //     }))
  //   )
  //   setEnviando(false)
  //   setConfirmarBaixa(false)
  //   setModoEnvio(false)
  //   setCarrinho([])
  //   carregarEstoque()
  // }

  function toggleCarrinhoRecebimento(loteId: string) {
    setCarrinhoRecebimento(prev => {
      if (prev.includes(loteId)) {
        return prev.filter(id => id !== loteId)
      } else {
        return [...prev, loteId]
      }
    })
  }

  async function executarRecebimento() {
    if (carrinhoRecebimento.length === 0) {
      alert('Selecione pelo menos um item')
      return
    }

    await supabase.from('lotes_producao')
      .update({ status: 'na_loja' })
      .in('id', carrinhoRecebimento)
    await supabase.from('movimentacoes_estoque').insert(
      carrinhoRecebimento.map((id: any) => ({
        lote_id: id,
        tipo: 'entrada',
        local_destino: local,
        quantidade: 1,
        registrado_por: operador || 'Sistema',
      }))
    )

    setCarrinhoRecebimento([])
    setModoRecebimento(false)
    setConfirmarRecebimento(false)
    carregarEstoque()
  }

  function toggleCarrinhoBaixa(loteId: string) {
    setCarrinhoBaixa(prev => {
      if (prev.includes(loteId)) {
        return prev.filter(id => id !== loteId)
      } else {
        return [...prev, loteId]
      }
    })
  }

  function toggleProdutoExpandido(produtoId: string) {
    setProdutosExpandidos(prev => ({ ...prev, [produtoId]: !prev[produtoId] }))
  }

  async function executarBaixa() {
    if (carrinhoBaixa.length === 0) {
      alert('Selecione pelo menos um item')
      return
    }

    await supabase.from('lotes_producao')
      .update({ status: 'esgotado' })
      .in('id', carrinhoBaixa)
    await supabase.from('movimentacoes_estoque').insert(
      carrinhoBaixa.map((id: any) => ({
        lote_id: id,
        tipo: 'saida',
        local_origem: local,
        quantidade: 1,
        registrado_por: operador || 'Sistema',
      }))
    )

    setCarrinhoBaixa([])
    setModoBaixa(false)
    setConfirmarBaixa(false)
    carregarEstoque()
  }

  function toggleCarrinhoBaixaConsumo(loteId: string) {
    setCarrinhoBaixaConsumo(prev => {
      if (prev.includes(loteId)) {
        return prev.filter(id => id !== loteId)
      } else {
        return [...prev, loteId]
      }
    })
  }

  async function executarBaixaConsumo() {
    if (carrinhoBaixaConsumo.length === 0) {
      alert('Selecione pelo menos um item')
      return
    }

    await supabase.from('lotes_producao')
      .update({ status: 'esgotado' })
      .in('id', carrinhoBaixaConsumo)
    await supabase.from('movimentacoes_estoque').insert(
      carrinhoBaixaConsumo.map((id: any) => ({
        lote_id: id,
        tipo: 'saida',
        local_origem: 'cozinha',
        quantidade: 1,
        registrado_por: operador || 'Sistema',
      }))
    )

    setCarrinhoBaixaConsumo([])
    setModoBaixaConsumo(false)
    setConfirmarBaixaConsumo(false)
    carregarEstoque()
  }

  async function confirmarRecebimentoIndividual(lote_ids: string[]) {
    if (!operador) { alert('Informe seu nome primeiro'); return }
    await supabase.from('lotes_producao')
      .update({ status: 'na_loja' })
      .in('id', lote_ids)
    await supabase.from('movimentacoes_estoque').insert(
      lote_ids.map((id: any) => ({
        lote_id: id,
        tipo: 'entrada',
        local_destino: local,
        quantidade: 1,
        registrado_por: operador,
      }))
    )
    carregarEstoque()
  }

  async function darBaixa(lote_ids: string[]) {
    if (!operador) { alert('Informe seu nome primeiro'); return }
    await supabase.from('lotes_producao')
      .update({ status: 'esgotado' })
      .in('id', lote_ids)
    await supabase.from('movimentacoes_estoque').insert(
      lote_ids.map((id: any) => ({
        lote_id: id,
        tipo: 'saida',
        local_origem: local,
        quantidade: 1,
        registrado_por: operador,
      }))
    )
    carregarEstoque()
  }

  const JANELA_REVERSAO_HORAS = 24

  async function carregarBaixasRecentes() {
    setCarregandoBaixas(true)
    try {
      const doisDiasAtras = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

      const { data: baixas } = await supabase
        .from('movimentacoes_estoque')
        .select('id, lote_id, tipo, local_origem, quantidade, registrado_por, created_at, justificativa, estornado_de, lote:lotes_producao(id, codigo_qr, produto:produtos(nome, unidade_medida))')
        .eq('tipo', 'saida')
        .eq('local_origem', local)
        .gte('created_at', doisDiasAtras)
        .order('created_at', { ascending: false })

      const processadas = await anexarReversoes(baixas || [])
      setBaixasRecentes(processadas)
    } catch (err) {
      console.error('Erro ao carregar baixas recentes:', err)
    } finally {
      setCarregandoBaixas(false)
    }
  }

  // Anexa a movimentação de reversão (se existir) a cada baixa, para saber
  // se já foi revertida e não pode ser revertida de novo
  async function anexarReversoes(baixas: any[]) {
    const idsBaixas = baixas.map((b) => b.id)
    if (idsBaixas.length === 0) return baixas

    const { data: reversoes } = await supabase
      .from('movimentacoes_estoque')
      .select('estornado_de, created_at, justificativa, registrado_por')
      .in('estornado_de', idsBaixas)

    const revertidoPorBaixa = new Map<string, any>()
    reversoes?.forEach((r: any) => revertidoPorBaixa.set(r.estornado_de, r))

    return baixas.map((b) => ({ ...b, reversao: revertidoPorBaixa.get(b.id) || null }))
  }

  // Ciclo de estoque (entrada×saída) da própria unidade, no período — sem somar entre unidades
  function montarRelatorioDeLotes(lotesFonte: any[]) {
    const porItem = new Map<string, any>()
    lotesFonte.forEach((lote: any) => {
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
    return Array.from(porItem.values()).sort((a, b) => a.produto.localeCompare(b.produto))
  }

  // Unidade = aba atual: reaproveita os lotes que a própria página já
  // carregou (garante que o relatório nunca diverge da lista abaixo dele —
  // mesma fonte de dados). Unidade diferente ou "todas": busca dedicada,
  // com a mesma regra de status/destino que carregarEstoque() já usa certo
  // (destino='cozinha' não reflete a realidade — o que importa pra cozinha
  // é o status do lote, não o destino, que aponta pra qual loja ele é).
  async function carregarRelatorioGerencial() {
    if (unidadeRelatorio === local) {
      setRelatorioData(montarRelatorioDeLotes(lotes))
      return
    }

    setCarregandoRelatorio(true)
    try {
      let query = supabase
        .from('lotes_producao')
        .select('quantidade, peso_gramas, destino, produto:produtos(nome, categoria_id, unidade_medida, categoria:categorias(nome))')

      if (unidadeRelatorio === 'cozinha') {
        query = query.eq('status', 'na_cozinha')
      } else if (unidadeRelatorio === 'todas') {
        query = query.in('status', ['na_cozinha', 'enviado', 'na_loja'])
      } else {
        query = query.eq('destino', unidadeRelatorio).in('status', ['enviado', 'na_loja'])
      }

      const { data } = await query
      setRelatorioData(montarRelatorioDeLotes(data || []))
    } catch (err) {
      console.error('Erro ao carregar relatório gerencial:', err)
    } finally {
      setCarregandoRelatorio(false)
    }
  }

  async function buscarPorEtiqueta() {
    const termo = buscaEtiqueta.trim()
    if (!termo) {
      setResultadoBusca(null)
      return
    }

    setBuscandoEtiqueta(true)
    try {
      const { data: lotesEncontrados } = await supabase
        .from('lotes_producao')
        .select('id, codigo_qr, produto:produtos(nome, unidade_medida)')
        .ilike('codigo_qr', `%${termo}%`)
        .limit(20)

      if (!lotesEncontrados || lotesEncontrados.length === 0) {
        setResultadoBusca([])
        return
      }

      // Restrito à unidade selecionada: um usuário só pode reverter baixas
      // feitas na mesma unidade que está visualizando, igual ao histórico
      const loteIds = lotesEncontrados.map((l: any) => l.id)
      const { data: baixasEncontradas } = await supabase
        .from('movimentacoes_estoque')
        .select('id, lote_id, tipo, local_origem, quantidade, registrado_por, created_at, justificativa, estornado_de')
        .in('lote_id', loteIds)
        .eq('tipo', 'saida')
        .eq('local_origem', local)
        .order('created_at', { ascending: false })

      const comLote = (baixasEncontradas || []).map((b: any) => ({
        ...b,
        lote: lotesEncontrados.find((l: any) => l.id === b.lote_id),
      }))

      const processadas = await anexarReversoes(comLote)
      setResultadoBusca(processadas)
    } catch (err) {
      console.error('Erro ao buscar etiqueta:', err)
    } finally {
      setBuscandoEtiqueta(false)
    }
  }

  function horasDesde(dataIso: string) {
    return (Date.now() - new Date(dataIso).getTime()) / (60 * 60 * 1000)
  }

  async function confirmarReversao(baixa: any) {
    if (!justificativaTexto.trim()) {
      alert('Informe uma justificativa para reverter esta baixa.')
      return
    }

    setSalvandoReversao(true)
    try {
      const statusRestaurado = baixa.local_origem === 'cozinha' ? 'na_cozinha' : 'na_loja'

      await supabase.from('lotes_producao').update({ status: statusRestaurado }).eq('id', baixa.lote_id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: baixa.lote_id,
        tipo: 'entrada',
        local_destino: baixa.local_origem,
        quantidade: baixa.quantidade,
        registrado_por: operador || 'Sistema',
        justificativa: justificativaTexto.trim(),
        estornado_de: baixa.id,
      })

      setRevertendoId(null)
      setJustificativaTexto('')
      if (mostrarHistoricoBaixas) await carregarBaixasRecentes()
      if (resultadoBusca) await buscarPorEtiqueta()
      carregarEstoque()
    } catch (err) {
      console.error('Erro ao reverter baixa:', err)
      alert('Erro ao reverter baixa')
    } finally {
      setSalvandoReversao(false)
    }
  }

  function renderBaixaCard(baixa: any) {
    const horas = horasDesde(baixa.created_at)
    const revertivel = horas < JANELA_REVERSAO_HORAS && !baixa.reversao
    const horasRestantes = Math.max(0, JANELA_REVERSAO_HORAS - horas)

    return (
      <div key={baixa.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="font-semibold text-gray-800 text-sm">
              {baixa.lote?.produto?.nome || 'Produto desconhecido'}
            </p>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{baixa.lote?.codigo_qr}</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {baixa.quantidade} {baixa.lote?.produto?.unidade_medida || 'un'} · {baixa.registrado_por} ·{' '}
              {new Date(baixa.created_at).toLocaleString('pt-BR')}
            </p>

            {baixa.reversao ? (
              <p className="text-xs text-green-700 font-semibold mt-1.5">
                ✓ Revertida em {new Date(baixa.reversao.created_at).toLocaleString('pt-BR')} por{' '}
                {baixa.reversao.registrado_por} — "{baixa.reversao.justificativa}"
              </p>
            ) : revertivel ? (
              <p className="text-xs text-amber-700 font-semibold mt-1.5">
                {horasRestantes < 1
                  ? 'Menos de 1h restante para reverter'
                  : `${Math.floor(horasRestantes)}h restantes para reverter`}
              </p>
            ) : (
              <p className="text-xs text-gray-400 font-semibold mt-1.5">Prazo de reversão expirado</p>
            )}
          </div>

          {revertivel && revertendoId !== baixa.id && (
            <button
              onClick={() => {
                setRevertendoId(baixa.id)
                setJustificativaTexto('')
              }}
              className="flex-shrink-0 flex items-center gap-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              <RotateCcw size={13} />
              Reverter
            </button>
          )}
        </div>

        {revertendoId === baixa.id && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
            <textarea
              value={justificativaTexto}
              onChange={(e) => setJustificativaTexto(e.target.value)}
              placeholder="Justificativa: por que essa baixa está sendo revertida?"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRevertendoId(null); setJustificativaTexto('') }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmarReversao(baixa)}
                disabled={salvandoReversao}
                className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {salvandoReversao ? 'Revertendo...' : 'Confirmar reversão'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 py-2 sticky top-0 z-40 shadow-md flex items-center h-20">
        <div className="flex items-center gap-4">
          <OluquinhasLogo size="md" variant="oluquinhas" color="marrom" />
          <OluquinhasLogo size="xs" variant="rosto" color="marrom" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">Estoque</h1>
            <p className="text-xs text-gray-600">Gestão de Inventário</p>
          </div>
        </div>
      </div>
      <div className="p-4">
      <div className="pt-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800 mb-3">Estoque</h1>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {Object.entries(LOCAL_LABEL)
            .filter(([key]) => {
              // Se for loja, mostrar só a sua loja
              if (usuario?.role === 'loja') {
                return key === usuario.loja_id
              }
              // Se for cozinha, mostrar cozinha
              if (usuario?.role === 'cozinha') {
                return key === 'cozinha'
              }
              // Admin vê tudo
              return true
            })
            .map(([key, label]) => (
              <button key={key} onClick={() => setLocal(key)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap border ${local === key ? 'bg-pink-700 text-white border-pink-700 font-semibold' : 'bg-white border-gray-200 text-gray-600'}`}>
                {label}
              </button>
            ))}
        </div>
      </div>

      <div className="mb-3 text-sm">
        <p className="text-xs text-gray-500 mb-1">Operador</p>
        <p className="font-medium text-gray-800">{operador}</p>
      </div>

      {/* MODO: BAIXA DE CONSUMO - HEADER COM BOTÃO VOLTAR */}
      {modoBaixaConsumo && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-4 shadow-lg z-40 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">Modo: Baixa de Consumo</p>
            <p className="text-xs opacity-90">Selecione os itens consumidos</p>
          </div>
          <button
            onClick={() => {
              setModoBaixaConsumo(false)
              setCarrinhoBaixaConsumo([])
              setConfirmarBaixaConsumo(false)
            }}
            className="bg-red-700 hover:bg-red-800 text-white rounded-lg px-4 py-2 text-sm font-semibold"
          >
            ✕ Cancelar
          </button>
        </div>
      )}

      {/* Espaço para compensar o header quando em modo de consumo */}
      {modoBaixaConsumo && <div className="h-20" />}

      {/* NOTA: Envio de itens agora é realizado via aba "Expedição" (Romaneio)
          Os modais de envio abaixo foram removidos da UI de Estoque.
          A função criarEnvio() é reutilizada pelo módulo de Romaneio.
      */}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <>
          {/* MENU DE AÇÕES (substitui os cards soltos de Baixa/Reverter/Histórico) */}
          <div className="mb-6">
            <div className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setMostrarMenuAcoes(!mostrarMenuAcoes)}
                className="w-full flex items-center justify-between gap-2 p-4 hover:bg-gray-50"
              >
                <span className="text-sm font-semibold text-gray-800">⚙️ Ações</span>
                <ChevronDown size={18} className={`text-gray-500 transition-transform ${mostrarMenuAcoes ? 'rotate-180' : ''}`} />
              </button>

              {mostrarMenuAcoes && (
                <div className="border-t border-gray-200 p-2">
                  {local === 'cozinha' && !modoBaixaConsumo && (
                    <button
                      onClick={() => { setModoBaixaConsumo(true); setMostrarMenuAcoes(false) }}
                      className="w-full flex items-center gap-2.5 p-3 rounded-lg hover:bg-gray-50 text-sm text-gray-700 text-left"
                    >
                      📉 Baixa de Consumo
                    </button>
                  )}
                  <button
                    onClick={() => { setMostrarModalReverter(true); setMostrarMenuAcoes(false) }}
                    className="w-full flex items-center gap-2.5 p-3 rounded-lg hover:bg-gray-50 text-sm text-gray-700 text-left"
                  >
                    <RotateCcw size={16} /> Reverter Baixa por Etiqueta
                  </button>
                  <button
                    onClick={() => { setMostrarHistoricoBaixas(true); carregarBaixasRecentes(); setMostrarMenuAcoes(false) }}
                    className="w-full flex items-center gap-2.5 p-3 rounded-lg hover:bg-gray-50 text-sm text-gray-700 text-left"
                  >
                    <History size={16} /> Histórico de Baixas
                  </button>
                  {usuario?.role === 'admin' && (
                    <button
                      onClick={() => { setUnidadeRelatorio(local); setMostrarModalRelatorio(true); setMostrarMenuAcoes(false) }}
                      className="w-full flex items-center gap-2.5 p-3 rounded-lg hover:bg-gray-50 text-sm text-gray-700 text-left border-t border-gray-100 mt-1 pt-3"
                    >
                      📊 Relatório Gerencial
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MODAL: REVERTER BAIXA POR ETIQUETA */}
          {mostrarModalReverter && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <RotateCcw size={16} />
                    Reverter baixa por etiqueta
                  </p>
                  <button onClick={() => setMostrarModalReverter(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Digite o código (ou parte dele) da etiqueta baixada por engano. Busca apenas baixas feitas em{' '}
                  <strong>{LOCAL_LABEL[local]}</strong> (troque a unidade acima se necessário). Baixas de até 24h podem
                  ser revertidas mediante justificativa.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={buscaEtiqueta}
                    onChange={(e) => setBuscaEtiqueta(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buscarPorEtiqueta()}
                    placeholder="Ex: ALD-1783191721462-1"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={buscarPorEtiqueta}
                    disabled={buscandoEtiqueta}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {buscandoEtiqueta ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>

                {resultadoBusca && (
                  <div className="mt-3 space-y-2">
                    {resultadoBusca.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">Nenhuma baixa encontrada para essa etiqueta</p>
                    ) : (
                      resultadoBusca.map(renderBaixaCard)
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODAL: HISTÓRICO DE BAIXAS (últimas 48h, para consulta) */}
          {mostrarHistoricoBaixas && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <History size={16} />
                    Histórico de baixas
                  </span>
                  <button onClick={() => setMostrarHistoricoBaixas(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Últimas 48h em {LOCAL_LABEL[local]}. Para reverter, use "Reverter Baixa por Etiqueta" no menu Ações.
                </p>

                {carregandoBaixas ? (
                  <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
                ) : baixasRecentes.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Nenhuma baixa nas últimas 48h para {LOCAL_LABEL[local]}</p>
                ) : (
                  <div className="space-y-2">{baixasRecentes.map(renderBaixaCard)}</div>
                )}
              </div>
            </div>
          )}

          {/* MODAL: RELATÓRIO GERENCIAL (admin — migrado de Admin > Relatórios > Posição de Estoque) */}
          {mostrarModalRelatorio && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-800">📊 Relatório Gerencial</h3>
                  <button onClick={() => setMostrarModalRelatorio(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <select
                    value={unidadeRelatorio}
                    onChange={(e) => setUnidadeRelatorio(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="cozinha">Cozinha</option>
                    <option value="loja1">Paraisópolis</option>
                    <option value="loja2">Itajubá</option>
                    <option value="todas">Todas as unidades</option>
                  </select>
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setVisaoRelatorio('item')}
                      className={`px-3 py-1.5 rounded text-sm font-medium ${visaoRelatorio === 'item' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                    >
                      Por Item
                    </button>
                    <button
                      onClick={() => setVisaoRelatorio('categoria')}
                      className={`px-3 py-1.5 rounded text-sm font-medium ${visaoRelatorio === 'categoria' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
                    >
                      Por Categoria
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (visaoRelatorio === 'item') {
                        exportarCSV(relatorioData, ['produto', 'categoria', 'unidade_medida', 'quantidade_total', 'contador'], 'relatorio-estoque-por-item')
                      } else {
                        exportarCSV(relatorioPorCategoria, ['categoria', 'quantidade_total', 'itens'], 'relatorio-estoque-por-categoria')
                      }
                    }}
                    className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
                  >
                    <Download size={16} /> CSV
                  </button>
                </div>

                {carregandoRelatorio ? (
                  <p className="text-sm text-gray-400 text-center py-8">Carregando...</p>
                ) : (
                  <div className="overflow-x-auto">
                    {visaoRelatorio === 'item' ? (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left">Produto</th>
                            <th className="px-3 py-2 text-left">Categoria</th>
                            <th className="px-3 py-2 text-left">Un. Medida</th>
                            <th className="px-3 py-2 text-center">Qtd Disponível</th>
                            <th className="px-3 py-2 text-center">Etiquetas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorioData.map((item, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{item.produto}</td>
                              <td className="px-3 py-2">{item.categoria}</td>
                              <td className="px-3 py-2">{item.unidade_medida}</td>
                              <td className="px-3 py-2 text-center font-semibold text-blue-600">{item.quantidade_total}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{item.contador}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left">Categoria</th>
                            <th className="px-3 py-2 text-center">Qtd Total</th>
                            <th className="px-3 py-2 text-center">Itens Diferentes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {relatorioPorCategoria.map((cat: any, idx) => (
                            <tr key={idx} className="border-b hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium">{cat.categoria}</td>
                              <td className="px-3 py-2 text-center font-semibold text-blue-600">{cat.quantidade_total}</td>
                              <td className="px-3 py-2 text-center text-gray-500">{cat.itens}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {relatorioData.length === 0 && (
                      <div className="text-center py-8 text-gray-400">Nenhum produto encontrado</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HEADER GERENCIAL */}
          <div className="bg-white border-b border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">📊 Estoque</h1>
                <p className="text-gray-500 text-sm mt-1">{LOCAL_LABEL[local]}</p>
              </div>
            </div>

            {/* Resumo de Itens */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-600 text-xs font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{local === 'cozinha' ? lotes.filter(l => l.status === 'na_cozinha').length : lotes.filter(l => l.status === 'na_loja').length}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
                <p className="text-orange-700 text-xs font-medium">Vencendo em 7 dias</p>
                <p className="text-2xl font-bold text-orange-600 mt-1">{lotes.filter(l => {
                  const dias = Math.floor((new Date(l.data_validade + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  return dias >= 0 && dias <= 7
                }).length}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <p className="text-red-700 text-xs font-medium">Vencidos</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{lotes.filter(l => {
                  const dias = Math.floor((new Date(l.data_validade + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  return dias < 0
                }).length}</p>
              </div>
            </div>
          </div>

          {/* NOTE: Recebimentos agora aparecem apenas na aba Expedição > Recebimentos */}

          {/* MODAL DE DUPLA CONFIRMAÇÃO */}
          {confirmarRecebimento && carrinhoRecebimento.length > 0 && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Recebimento</h3>

                <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                  <p className="text-sm text-blue-800 font-semibold mb-3">📦 Itens a receber:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {lotes
                      .filter(l => carrinhoRecebimento.includes(l.id))
                      .map((lote: any) => (
                        <div key={lote.id} className="text-sm text-gray-700 flex justify-between items-center">
                          <span>{lote.produto?.nome}</span>
                          <span className="text-xs text-gray-500">{lote.codigo_qr.substring(0, 16)}...</span>
                        </div>
                      ))}
                  </div>
                  <p className="text-sm font-bold text-blue-900 mt-3 pt-3 border-t border-blue-200">
                    Total: {carrinhoRecebimento.length} etiqueta(s)
                  </p>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  ⚠️ <strong>Você conferiu todos os itens?</strong> Esta ação não pode ser desfeita.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmarRecebimento(false)}
                    className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={executarRecebimento}
                    className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold hover:bg-green-700"
                  >
                    ✓ Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL DE DUPLA CONFIRMAÇÃO - VENDA */}
          {confirmarBaixa && carrinhoBaixa.length > 0 && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Baixa</h3>

                <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                  <p className="text-sm text-red-800 font-semibold mb-3">📦 Itens a vender:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {lotes
                      .filter(l => carrinhoBaixa.includes(l.id))
                      .map((lote: any) => (
                        <div key={lote.id} className="text-sm text-gray-700 flex justify-between items-center">
                          <span>{lote.produto?.nome}</span>
                          <span className="text-xs text-gray-500">{lote.codigo_qr.substring(0, 16)}...</span>
                        </div>
                      ))}
                  </div>
                  <p className="text-sm font-bold text-red-900 mt-3 pt-3 border-t border-red-200">
                    Total: {carrinhoBaixa.length} etiqueta(s)
                  </p>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  ⚠️ <strong>Você conferiu todos os itens?</strong> Esta ação não pode ser desfeita.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmarBaixa(false)}
                    className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={executarBaixa}
                    className="flex-1 bg-red-600 text-white rounded-lg py-2 font-semibold hover:bg-red-700"
                  >
                    ✓ Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MODAL DE DUPLA CONFIRMAÇÃO - BAIXA POR CONSUMO */}
          {confirmarBaixaConsumo && carrinhoBaixaConsumo.length > 0 && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Baixa de Consumo</h3>

                <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                  <p className="text-sm text-red-800 font-semibold mb-3">📦 Itens consumidos:</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {lotes
                      .filter(l => carrinhoBaixaConsumo.includes(l.id))
                      .map((lote: any) => (
                        <div key={lote.id} className="text-sm text-gray-700 flex justify-between items-center">
                          <span>{lote.produto?.nome}</span>
                          <span className="text-xs text-gray-500">{lote.codigo_qr.substring(0, 16)}...</span>
                        </div>
                      ))}
                  </div>
                  <p className="text-sm font-bold text-red-900 mt-3 pt-3 border-t border-red-200">
                    Total: {carrinhoBaixaConsumo.length} etiqueta(s)
                  </p>
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  ⚠️ <strong>Esses itens foram consumidos?</strong> Esta ação não pode ser desfeita.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmarBaixaConsumo(false)}
                    className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={executarBaixaConsumo}
                    className="flex-1 bg-red-600 text-white rounded-lg py-2 font-semibold hover:bg-red-700"
                  >
                    ✓ Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BLOCO 2: ESTOQUE DISPONÍVEL (Pendente de Venda) */}
          {(() => {
            let lotesDisponiveis = local === 'cozinha'
              ? lotes.filter(l => l.status === 'na_cozinha')
              : lotes.filter(l => l.status === 'na_loja')

            // No modo de baixa por consumo, filtrar apenas itens de insumos (ordens internas)
            if (modoBaixaConsumo) {
              lotesDisponiveis = lotesDisponiveis.filter(l => l.ordem?.tipo_ordem === 'interna')
            }
            return lotesDisponiveis.length > 0 ? (
              <div className="bg-white border-2 border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-lg font-bold text-gray-800">
                    {local === 'cozinha' ? '📦 Pronto para Enviar' : '📦 Estoque Disponível'}
                  </p>
                </div>
                <div className="space-y-4">
                  {(() => {
                    // Agrupar lotes por categoria e depois por produto
                    const lotesPorCategoria: Record<string, Record<string, any[]>> = {}
                    lotesDisponiveis.forEach((lote: any) => {
                      const categoria = lote.produto?.categoria?.nome || 'Sem categoria'
                      const produtoId = lote.produto_id
                      if (!lotesPorCategoria[categoria]) {
                        lotesPorCategoria[categoria] = {}
                      }
                      if (!lotesPorCategoria[categoria][produtoId]) {
                        lotesPorCategoria[categoria][produtoId] = []
                      }
                      lotesPorCategoria[categoria][produtoId].push(lote)
                    })

                    return Object.entries(lotesPorCategoria).sort().map(([categoria, produtosPorCat]: any) => {
                      return (
                        <div key={categoria} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
                          {/* Cabeçalho da Categoria */}
                          <div className="bg-gradient-to-r from-gray-700 to-gray-600 text-white px-4 py-3">
                            <h2 className="font-bold text-lg">{categoria}</h2>
                          </div>

                          {/* Produtos da Categoria */}
                          <div className="space-y-2 p-4">
                            {Object.entries(produtosPorCat).map(([produtoId, lotesDoProduto]: any) => {
                              const produto = lotesDoProduto[0].produto
                              // Para Gramas, soma o peso de cada etiqueta; para os demais, soma a quantidade (não a contagem de etiquetas)
                              const ehPeso = produto.unidade_medida === 'Gramas'
                              const quantidade = lotesDoProduto.reduce((soma: number, l: any) => soma + (ehPeso ? (l.peso_gramas || 0) : (l.quantidade || 0)), 0)
                              const itemsProxVencimento = lotesDoProduto.filter((l: any) => {
                                const dias = Math.floor((new Date(l.data_validade + 'T00:00:00').getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                                return dias >= 0 && dias <= 7
                              }).length
                      return (
                        <div key={produtoId} className="bg-gray-50 border-2 border-gray-300 rounded-xl p-4">
                          {/* Cabeçalho do Produto */}
                          <div
                            onClick={() => toggleProdutoExpandido(produtoId)}
                            className="mb-4 pb-4 border-b border-gray-300 cursor-pointer hover:bg-gray-100 -m-4 mb-0 p-4 rounded-t-xl transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-lg text-gray-800">{produto.nome}</p>
                                  {itemsProxVencimento > 0 && (
                                    <span className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-1 rounded-full">
                                      ⚠️ {itemsProxVencimento} vencendo
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mt-1">
                                  📦 {quantidade} {ehPeso ? produto.unidade_medida : (quantidade === 1 ? 'unidade' : 'unidades')}
                                  {produto.congelado ? ' ❄️' : ''}
                                </p>
                              </div>
                              <div className="text-gray-400 text-xl">
                                {produtosExpandidos[produtoId] || modoBaixa || modoBaixaConsumo ? '▼' : '▶'}
                              </div>
                            </div>
                          </div>

                          {/* Lista de Etiquetas - Retraída por padrão */}
                          {(produtosExpandidos[produtoId] || modoBaixa || modoBaixaConsumo) && (
                          <div className="space-y-2">
                            {lotesDoProduto.map((lote: any, idx: number) => {
                              const dataValidade = new Date(lote.data_validade + 'T00:00:00')
                              const diasAteVencer = Math.floor((dataValidade.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                              const diasEmEstoque = lote.data_producao
                                ? Math.floor((new Date().getTime() - new Date(lote.data_producao + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
                                : null

                              let corRisco = 'bg-green-100'
                              let corTexto = 'text-green-700'
                              let aviso = '✅'

                              if (diasAteVencer < 0) {
                                corRisco = 'bg-red-100'
                                corTexto = 'text-red-700'
                                aviso = '🚨 VENCIDO'
                              } else if (diasAteVencer === 0) {
                                corRisco = 'bg-red-100'
                                corTexto = 'text-red-700'
                                aviso = '⚠️ VENCE HOJE'
                              } else if (diasAteVencer <= 3) {
                                corRisco = 'bg-orange-100'
                                corTexto = 'text-orange-700'
                                aviso = '⚠️ URGENTE'
                              } else if (diasAteVencer <= 7) {
                                corRisco = 'bg-yellow-100'
                                corTexto = 'text-yellow-700'
                                aviso = '🟡 ATENÇÃO'
                              }

                              const carrinhoAtivo = modoBaixaConsumo ? carrinhoBaixaConsumo : (local === 'cozinha' ? carrinho : carrinhoBaixa)
                              const selecionado = carrinhoAtivo.includes(lote.id)
                              const toggleFn = modoBaixaConsumo ? toggleCarrinhoBaixaConsumo : (local === 'cozinha' ? toggleCarrinho : toggleCarrinhoBaixa)

                              return (
                                <div
                                  key={lote.id}
                                  className={`${corRisco} rounded-lg p-3 border ${corTexto.replace('text-', 'border-')} border cursor-pointer transition-all hover:shadow-md ${selecionado ? `ring-2 ${modoBaixaConsumo ? 'ring-red-600' : (local === 'cozinha' ? 'ring-amber-500' : 'ring-red-500')}` : ''}`}
                                  onClick={() => toggleFn(lote.id)}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selecionado ? `${modoBaixaConsumo ? 'bg-red-600 border-red-600' : (local === 'cozinha' ? 'bg-amber-500 border-amber-500' : 'bg-red-600 border-red-600')}` : 'border-gray-300'}`}>
                                      {selecionado && <span className="text-white text-xs">✓</span>}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium text-gray-800">
                                          Etiqueta {idx + 1} • {lote.codigo_qr}
                                        </p>
                                        <p className={`text-xs font-semibold ${corTexto}`}>{aviso}</p>
                                      </div>
                                      <p className="text-xs text-gray-600 mt-1">
                                        Validade: {dataValidade.toLocaleDateString('pt-BR')} • {diasAteVencer} dias
                                        {diasEmEstoque !== null && (
                                          <> • Em estoque há {diasEmEstoque} dia{diasEmEstoque === 1 ? '' : 's'}</>
                                        )}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          )}

                        </div>
                      )
                            })}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>



                {local !== 'cozinha' && carrinhoBaixa.length > 0 && (
                  <div className="fixed bottom-28 right-6 bg-gray-800 text-white rounded-lg p-3 shadow-md border border-gray-700 z-40 max-w-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">🛒 {carrinhoBaixa.length} item(ns)</p>
                      </div>
                      <button
                        onClick={() => setConfirmarBaixa(true)}
                        className="bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                      >
                        Dar Baixa
                      </button>
                    </div>
                  </div>
                )}

                {local === 'cozinha' && modoBaixaConsumo && carrinhoBaixaConsumo.length > 0 && (
                  <div className="fixed bottom-28 right-6 bg-gray-800 text-white rounded-lg p-3 shadow-md border border-gray-700 z-40 max-w-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">🛒 {carrinhoBaixaConsumo.length} item(ns)</p>
                      </div>
                      <button
                        onClick={() => setConfirmarBaixaConsumo(true)}
                        className="bg-gray-700 hover:bg-gray-600 text-white rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                      >
                        Dar Baixa
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                {lotes.length === 0
                  ? `Sem estoque em ${LOCAL_LABEL[local]}`
                  : modoBaixaConsumo
                  ? 'Nenhum insumo disponível para baixa de consumo'
                  : 'Nenhum item disponível para venda'}
              </div>
            )
          })()}
        </>
      )}
    </div>
    </div>
  )
}
