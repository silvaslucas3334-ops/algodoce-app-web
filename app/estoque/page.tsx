'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { ShoppingCart, Trash2, Send } from 'lucide-react'

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
  const [produtosExpandidos, setProdutosExpandidos] = useState<Record<string, boolean>>({})
  const [mostrarRecebimento, setMostrarRecebimento] = useState(false)

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

  async function carregarEstoque() {
    setLoading(true)
    setCarrinho([])
    setModoEnvio(false)

    let query = supabase
      .from('lotes_producao')
      .select('id, codigo_qr, produto_id, ordem_id, quantidade, peso_gramas, data_producao, data_validade, produzido_por, destino, status, produto:produtos(nome, tipo, categoria, unidade_medida, congelado), ordem:ordens_producao(numero_ordem, data_entrega, loja_destino)')

    // Filtrar por local (onde está agora)
    if (local === 'cozinha') {
      query = query.eq('status', 'na_cozinha')
    } else {
      // Para lojas, filtrar por destino e status
      query = query.eq('destino', local).in('status', ['enviado', 'na_loja'])
    }

    const { data, error } = await query.order('data_validade')

    console.log('Estoque carregado:', { local, data, error })
    if (data && data.length > 0) {
      console.log('Primeiro lote:', data[0])
    }
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
  console.log('Lotes agrupados:', lotesAgrupList)

  function toggleCarrinho(loteId: string) {
    setCarrinho(prev => {
      if (prev.includes(loteId)) {
        return prev.filter(id => id !== loteId)
      } else {
        return [...prev, loteId]
      }
    })
  }

  async function criarEnvio() {
    if (carrinho.length === 0 || !operador) return
    setEnviando(true)
    await supabase.from('lotes_producao')
      .update({ status: 'enviado', destino: destinoEnvio })
      .in('id', carrinho)
    await supabase.from('movimentacoes_estoque').insert(
      carrinho.map((id: any) => ({
        lote_id: id,
        tipo: 'transferencia',
        local_origem: local,
        local_destino: destinoEnvio,
        quantidade: 1,
        registrado_por: operador,
      }))
    )
    setEnviando(false)
    setConfirmarBaixa(false)
    setModoEnvio(false)
    setCarrinho([])
    carregarEstoque()
  }

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

  return (
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

      {/* MODAL: ESCOLHER LOJA PARA CRIAR ENVIO */}
      {local === 'cozinha' && confirmarRecebimento && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Enviar para qual loja?</h2>
            <div className="space-y-3">
              <button
                onClick={() => { setDestinoEnvio('loja1'); setModoEnvio(true); setConfirmarRecebimento(false) }}
                className="w-full bg-amber-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-amber-700"
              >
                📍 Paraisópolis
              </button>
              <button
                onClick={() => { setDestinoEnvio('loja2'); setModoEnvio(true); setConfirmarRecebimento(false) }}
                className="w-full bg-amber-600 text-white rounded-lg py-3 text-sm font-semibold hover:bg-amber-700"
              >
                📍 Itajubá
              </button>
              <button
                onClick={() => setConfirmarRecebimento(false)}
                className="w-full bg-gray-100 text-gray-700 rounded-lg py-3 text-sm font-semibold hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARRINHO FLUTUANTE DURANTE SELEÇÃO */}
      {local === 'cozinha' && modoEnvio && (
        <div className="fixed bottom-28 right-6 bg-amber-600 text-white rounded-lg p-3 shadow-md border border-amber-700 z-40 max-w-xs">
          <div className="space-y-2">
            <div>
              <p className="text-xs font-semibold">📍 {LOCAL_LABEL[destinoEnvio]}</p>
              <p className="text-xs text-amber-100">🛒 {carrinho.length} item(ns) selecionado(ns)</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setModoEnvio(false); setCarrinho([]) }}
                className="flex-1 bg-amber-700 hover:bg-amber-800 text-white rounded px-2 py-1.5 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => setConfirmarBaixa(true)}
                disabled={carrinho.length === 0}
                className="flex-1 bg-amber-800 hover:bg-amber-900 text-white rounded px-2 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DUPLA VERIFICAÇÃO (CONFIRMAÇÃO) */}
      {local === 'cozinha' && confirmarBaixa && carrinho.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Confirmar Envio</h2>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Operador</label>
                <p className="text-sm font-medium text-gray-800 bg-gray-50 border border-gray-300 rounded-lg px-3 py-2.5">
                  {operador}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-lg p-3 mb-4 border border-amber-200">
              <p className="text-xs font-semibold text-amber-900 mb-2">📦 Itens a enviar:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {lotes
                  .filter(l => carrinho.includes(l.id))
                  .map((lote, idx) => (
                    <div key={lote.id} className="text-xs text-amber-800">
                      <span className="font-medium">{idx + 1}.</span> {lote.produto?.nome} • {lote.codigo_qr.substring(0, 16)}...
                    </div>
                  ))}
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              ⚠️ <strong>Você vai enviar {carrinho.length} item(ns)</strong> para <strong>{LOCAL_LABEL[destinoEnvio]}</strong>
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmarBaixa(false)}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2.5 font-semibold hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                onClick={criarEnvio}
                disabled={enviando || !operador}
                className="flex-1 bg-amber-600 text-white rounded-lg py-2.5 font-semibold hover:bg-amber-700 disabled:opacity-40"
              >
                {enviando ? 'Enviando...' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <>
          {/* CARD: CRIAR ENVIO (Só aparece na cozinha) */}
          {local === 'cozinha' && !modoEnvio && (
            <div className="bg-white rounded-lg border border-amber-200 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Enviar itens para as lojas</p>
                  <p className="text-xs text-gray-500 mt-1">Selecione os itens e escolha o destino</p>
                </div>
                <button
                  onClick={() => setConfirmarRecebimento(true)}
                  className="bg-amber-600 text-white rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-amber-700"
                >
                  🚚 Criar Envio
                </button>
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
              {usuario?.role === 'loja' && lojesPendentes.length > 0 && (
                <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-sm font-semibold border border-blue-200">
                  📥 {lojesPendentes.length} pendente(s)
                </div>
              )}
            </div>

            {/* Resumo de Itens */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-gray-600 text-xs font-medium">Total</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{lotes.length}</p>
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

          {/* BLOCO 1: PENDENTE DE RECEBIMENTO (Cozinha + Loja) */}
          {usuario?.role === 'loja' && (() => {
            const lotesPendentesBloco = lojesPendentes
            return lotesPendentesBloco.length > 0 ? (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-lg font-bold text-blue-700">📥 Pendente de Recebimento ({lotesPendentesBloco.length})</p>
                  {usuario?.role === 'loja' && (
                    <button
                      onClick={() => setModoRecebimento(!modoRecebimento)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium ${modoRecebimento ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white'}`}
                    >
                      {modoRecebimento ? 'Cancelar' : 'Receber'}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {lotesPendentesBloco.map((lote: any) => {
                    const selecionado = carrinhoRecebimento.includes(lote.id)
                    return (
                      <div
                        key={lote.id}
                        className={`bg-white rounded-lg p-3 border border-blue-100 cursor-pointer transition-all ${modoRecebimento ? 'hover:shadow-md' : ''} ${selecionado ? 'ring-2 ring-blue-500' : ''}`}
                        onClick={() => modoRecebimento && toggleCarrinhoRecebimento(lote.id)}
                      >
                        <div className="flex items-start gap-3">
                          {modoRecebimento && (
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selecionado ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                              {selecionado && <span className="text-white text-xs">✓</span>}
                            </div>
                          )}
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800">{lote.produto?.nome}</p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              Etiqueta: {lote.codigo_qr}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {lote.produto?.unidade_medida === 'Gramas' ? `${lote.peso_gramas}g` : `${lote.quantidade} ${lote.produto?.unidade_medida}`}
                              {lote.produto?.congelado ? ' ❄️' : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">Validade:</p>
                            <p className="text-sm font-medium text-gray-800">
                              {new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {modoRecebimento && carrinhoRecebimento.length > 0 && usuario?.role === 'loja' && (
                  <div className="bg-blue-100 border border-blue-300 rounded-lg p-3 mt-4">
                    <p className="text-xs text-blue-700 font-semibold mb-3">✓ {carrinhoRecebimento.length} item(ns) selecionado(s)</p>
                    <button
                      onClick={() => setConfirmarRecebimento(true)}
                      className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700"
                    >
                      Conferir e Confirmar
                    </button>
                  </div>
                )}
              </div>
            ) : null
          })()}

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

          {/* BLOCO 2: ESTOQUE DISPONÍVEL (Pendente de Venda) */}
          {(() => {
            const lotesDisponiveis = local === 'cozinha'
              ? lotes.filter(l => l.status === 'na_cozinha')
              : lotes.filter(l => l.status === 'na_loja')
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
                    lotesDisponiveis.forEach(lote => {
                      const categoria = lote.produto?.categoria || 'Outros'
                      const produtoId = lote.produto_id
                      if (!lotesPorCategoria[categoria]) {
                        lotesPorCategoria[categoria] = {}
                      }
                      if (!lotesPorCategoria[categoria][produtoId]) {
                        lotesPorCategoria[categoria][produtoId] = []
                      }
                      lotesPorCategoria[categoria][produtoId].push(lote)
                    })

                    return Object.entries(lotesPorCategoria).sort().map(([categoria, produtosPorCat]) => {
                      return (
                        <div key={categoria} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
                          {/* Cabeçalho da Categoria */}
                          <div className="bg-gradient-to-r from-gray-700 to-gray-600 text-white px-4 py-3">
                            <h2 className="font-bold text-lg">{categoria}</h2>
                          </div>

                          {/* Produtos da Categoria */}
                          <div className="space-y-2 p-4">
                            {Object.entries(produtosPorCat).map(([produtoId, lotesDoProduto]) => {
                              const produto = lotesDoProduto[0].produto
                              const quantidade = lotesDoProduto.length
                              const itemsProxVencimento = lotesDoProduto.filter(l => {
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
                                  📦 {quantidade} {quantidade === 1 ? 'unidade' : 'unidades'}
                                  {produto.congelado ? ' ❄️' : ''}
                                </p>
                              </div>
                              <div className="text-gray-400 text-xl">
                                {produtosExpandidos[produtoId] || modoBaixa ? '▼' : '▶'}
                              </div>
                            </div>
                          </div>

                          {/* Lista de Etiquetas - Retraída por padrão */}
                          {(produtosExpandidos[produtoId] || modoBaixa) && (
                          <div className="space-y-2">
                            {lotesDoProduto.map((lote, idx) => {
                              const dataValidade = new Date(lote.data_validade + 'T00:00:00')
                              const diasAteVencer = Math.floor((dataValidade.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

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

                              const carrinhoAtivo = local === 'cozinha' ? carrinho : carrinhoBaixa
                              const selecionado = carrinhoAtivo.includes(lote.id)
                              const toggleFn = local === 'cozinha' ? toggleCarrinho : toggleCarrinhoBaixa

                              return (
                                <div
                                  key={lote.id}
                                  className={`${corRisco} rounded-lg p-3 border ${corTexto.replace('text-', 'border-')} border cursor-pointer transition-all hover:shadow-md ${selecionado ? `ring-2 ${local === 'cozinha' ? 'ring-amber-500' : 'ring-red-500'}` : ''}`}
                                  onClick={() => toggleFn(lote.id)}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selecionado ? `${local === 'cozinha' ? 'bg-amber-500 border-amber-500' : 'bg-red-600 border-red-600'}` : 'border-gray-300'}`}>
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
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                {lotes.length === 0 ? `Sem estoque em ${LOCAL_LABEL[local]}` : 'Nenhum item disponível para venda'}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
