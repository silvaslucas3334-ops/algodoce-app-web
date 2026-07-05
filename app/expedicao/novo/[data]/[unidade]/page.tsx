'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, AlertCircle, Loader, CheckCircle, ShoppingCart } from 'lucide-react'

interface LoteEstoque {
  id: string
  codigo_qr: string
  produto_id: string
  produto_nome: string
  quantidade: number
  peso_gramas: number | null
  data_validade: string
}

interface Ordem {
  id: string
  numero_ordem: number
  produto_id: string
  produto_nome: string
  quantidade: number
  ja_enviada: boolean
}

interface ProdutoAgrupado {
  produto_id: string
  produto_nome: string
  unidade_medida: string
  etiquetas: LoteEstoque[]
  selecionadas: string[]
  total_selecionado: number
}

export default function SelecionarEstoquePage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const data = params.data as string
  const unidade = params.unidade as string

  const [step, setStep] = useState(1)
  const [estoque, setEstoque] = useState<Map<string, ProdutoAgrupado>>(new Map())
  const [ordens, setOrdens] = useState<Ordem[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})

  // Carregar ordens e estoque
  useEffect(() => {
    const carregar = async () => {
      try {
        // Buscar ordens emitidas para aquele dia naquela unidade
        const { data: ordensData } = await supabase
          .from('ordens_producao')
          .select('id, numero_ordem, produto_id, quantidade, produto:produtos(nome)')
          .eq('data_entrega', data)
          .eq('loja_destino', unidade)
          .in('status', ['pendente', 'em_producao'])
          .order('numero_ordem')

        // Buscar romaneios já confirmados para ver quais ordens já foram enviadas
        const { data: romaneiosEnviados } = await supabase
          .from('romaneios')
          .select('linhas')
          .eq('data_entrega', data)
          .eq('unidade_destino', unidade)
          .eq('status', 'confirmado')

        // Extrair ordem_ids já enviadas
        const ordemIdJaEnviadas = new Set<string>()
        romaneiosEnviados?.forEach((rom: any) => {
          rom.linhas?.forEach((linha: any) => {
            linha.ordem_ids?.forEach((oid: string) => ordemIdJaEnviadas.add(oid))
          })
        })

        // Marcar ordens já enviadas
        const ordensProcessadas: Ordem[] = (ordensData || []).map((ord: any) => ({
          id: ord.id,
          numero_ordem: ord.numero_ordem,
          produto_id: ord.produto_id,
          produto_nome: ord.produto?.nome,
          quantidade: ord.quantidade,
          ja_enviada: ordemIdJaEnviadas.has(ord.id),
        }))

        // Buscar lotes disponíveis para a unidade
        const { data: lotesData } = await supabase
          .from('lotes_producao')
          .select('id, codigo_qr, produto_id, quantidade, peso_gramas, data_validade, destino, produto:produtos(nome, unidade_medida)')
          .eq('status', 'na_cozinha')
          .eq('destino', unidade)
          .order('data_validade')

        // Agrupar estoque por produto
        const estoqueMap = new Map<string, ProdutoAgrupado>()

        lotesData?.forEach((lote: any) => {
          const prodId = lote.produto_id
          if (!estoqueMap.has(prodId)) {
            estoqueMap.set(prodId, {
              produto_id: prodId,
              produto_nome: lote.produto?.nome || 'Desconhecido',
              unidade_medida: lote.produto?.unidade_medida || 'unidade',
              etiquetas: [],
              selecionadas: [],
              total_selecionado: 0,
            })
          }

          const prod = estoqueMap.get(prodId)!
          prod.etiquetas.push({
            id: lote.id,
            codigo_qr: lote.codigo_qr,
            produto_id: lote.produto_id,
            produto_nome: lote.produto?.nome,
            quantidade: lote.quantidade,
            peso_gramas: lote.peso_gramas,
            data_validade: lote.data_validade,
          })
        })

        setEstoque(estoqueMap)
        setOrdens(ordensProcessadas)
        setLoading(false)
      } catch (err) {
        console.error('Erro:', err)
        setLoading(false)
      }
    }

    carregar()
  }, [data, unidade])

  function toggleEtiqueta(produtoId: string, loteId: string) {
    setEstoque((prev) => {
      const novo = new Map(prev)
      const prod = novo.get(produtoId)
      if (!prod) return novo

      const etiqueta = prod.etiquetas.find((e) => e.id === loteId)
      const qtd = etiqueta?.quantidade || etiqueta?.peso_gramas || 0

      if (prod.selecionadas.includes(loteId)) {
        novo.set(produtoId, {
          ...prod,
          selecionadas: prod.selecionadas.filter((id) => id !== loteId),
          total_selecionado: Math.max(0, prod.total_selecionado - qtd),
        })
      } else {
        novo.set(produtoId, {
          ...prod,
          selecionadas: [...prod.selecionadas, loteId],
          total_selecionado: prod.total_selecionado + qtd,
        })
      }
      return novo
    })
  }

  async function criarRomaneio() {
    const linhas = Array.from(estoque.values())
      .filter((prod) => prod.selecionadas.length > 0)
      .map((prod) => ({
        produto_id: prod.produto_id,
        nome_produto: prod.produto_nome,
        unidade_medida: prod.unidade_medida,
        qtd_pedida: 0,
        qtd_sugerida: prod.total_selecionado,
        qtd_ajustada: prod.total_selecionado,
        ordem_ids: [], // Será preenchido se houver ordens associadas
        etiquetas_selecionadas: prod.selecionadas,
        aviso: null,
      }))

    if (linhas.length === 0) {
      alert('Selecione pelo menos uma etiqueta')
      return
    }

    setSalvando(true)
    try {
      const response = await fetch('/api/romaneios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_entrega: data,
          status: 'rascunho',
          criado_por: usuario?.id || null,
          unidade_destino: unidade,
          linhas,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error)

      // Navegar para o romaneio criado (Step 3)
      router.push(`/expedicao/${result.data.id}?step=3`)
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao criar romaneio')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando ordens e estoque...
      </div>
    )
  }

  // STEP 1: Ordens + Estoque
  if (step === 1) {
    const ordensNaoEnviadas = ordens.filter((o) => !o.ja_enviada)
    const produtosComEstoque = estoque.size > 0

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Step 1: Selecionar Estoque</h1>
              <p className="text-sm text-gray-600">
                Data: {new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')} | Destino:{' '}
                {unidade === 'loja1' ? 'Paraisópolis' : 'Itajubá'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Ordens Emitidas */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-gray-800 mb-4">📋 Ordens Emitidas para Este Dia</h2>
            {ordensNaoEnviadas.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  ✓ Todas as ordens deste dia já foram enviadas!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {ordensNaoEnviadas.map((ordem) => {
                  const temEstoque = estoque.has(ordem.produto_id)
                  return (
                    <div
                      key={ordem.id}
                      className={`p-4 rounded-lg border ${
                        temEstoque
                          ? 'bg-white border-green-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{ordem.produto_nome}</p>
                          <p className="text-sm text-gray-600">
                            Quantidade: {ordem.quantidade} {estoque.get(ordem.produto_id)?.unidade_medida || 'un'}
                          </p>
                        </div>
                        {!temEstoque && (
                          <div className="text-right">
                            <p className="text-xs text-amber-700 font-semibold">
                              ⚠️ Conferir se não foi enviado ou ainda está em produção
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Estoque Disponível */}
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-4">📦 Estoque Disponível</h2>
            {estoque.size === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <AlertCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 mb-4">Nenhum estoque disponível para esta unidade e data</p>
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
                >
                  Prosseguir para Seleção Manual
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {Array.from(estoque.values()).map((produto) => (
                    <div key={produto.produto_id} className="bg-white rounded-lg border border-gray-200">
                      <button
                        onClick={() =>
                          setExpandidas((prev) => ({
                            ...prev,
                            [produto.produto_id]: !prev[produto.produto_id],
                          }))
                        }
                        className="w-full px-6 py-4 hover:bg-gray-50 text-left flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-gray-800">{produto.produto_nome}</p>
                          <p className="text-sm text-gray-600">
                            Disponível: {produto.etiquetas.length} etiquetas | Selecionado: {produto.total_selecionado}{' '}
                            {produto.unidade_medida}
                          </p>
                        </div>
                        <div className="text-sm font-semibold text-blue-600">{produto.selecionadas.length} marcadas</div>
                      </button>

                      {expandidas[produto.produto_id] && (
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-3">
                          {produto.etiquetas.map((etiqueta) => (
                            <label
                              key={etiqueta.id}
                              className="flex items-center gap-3 p-2 hover:bg-white rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={produto.selecionadas.includes(etiqueta.id)}
                                onChange={() => toggleEtiqueta(produto.produto_id, etiqueta.id)}
                                className="w-4 h-4 accent-blue-600"
                              />
                              <div className="flex-1 text-sm">
                                <p className="font-mono text-gray-800">{etiqueta.codigo_qr}</p>
                                <p className="text-xs text-gray-600">
                                  {etiqueta.quantidade || etiqueta.peso_gramas} {produto.unidade_medida} • Val:{' '}
                                  {new Date(etiqueta.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => router.back()}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      const temSelecionados = Array.from(estoque.values()).some(p => p.selecionadas.length > 0)
                      if (temSelecionados) {
                        criarRomaneio()
                      } else {
                        setStep(2)
                      }
                    }}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <ShoppingCart size={18} />
                    Continuar para Revisão
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // STEP 2: Se nada foi selecionado em Step 1
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Step 2: Seleção Manual</h1>
          <p className="text-gray-600 mb-6">
            Nenhum produto foi selecionado do Step 1. Você pode voltar e selecionar estoque ou cancelar.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Voltar
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
