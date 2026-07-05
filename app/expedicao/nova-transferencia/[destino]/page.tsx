'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Package } from 'lucide-react'

interface ProdutoAgrupado {
  produto_id: string
  produto_nome: string
  unidade_medida: string
  etiquetas: any[]
  selecionadas: string[]
  total_selecionado: number
}

export default function SelecioarEstoqueTransferenciaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const destino = params.destino as string

  const [estoque, setEstoque] = useState<Map<string, ProdutoAgrupado>>(new Map())
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})

  // Mapa de destino
  const destinoLabel = destino === 'cozinha' ? 'Cozinha' : destino === 'loja1' ? 'Paraisópolis' : 'Itajubá'

  useEffect(() => {
    carregarEstoque()
  }, [usuario?.loja_id])

  async function carregarEstoque() {
    if (!usuario?.loja_id) return
    setLoading(true)

    try {
      // Buscar estoque da loja (status='na_loja')
      const { data, error } = await supabase
        .from('lotes_producao')
        .select(
          'id, codigo_qr, produto_id, quantidade, peso_gramas, data_validade, status, produto:produtos(nome, unidade_medida)'
        )
        .eq('destino', usuario.loja_id)
        .eq('status', 'na_loja')
        .order('data_validade')

      if (error) throw error

      // Agrupar por produto
      const novo = new Map<string, ProdutoAgrupado>()
      data?.forEach((lote: any) => {
        const chave = lote.produto_id
        const produtoInfo = Array.isArray(lote.produto) ? lote.produto[0] : lote.produto
        if (!novo.has(chave)) {
          novo.set(chave, {
            produto_id: lote.produto_id,
            produto_nome: produtoInfo?.nome || 'Desconhecido',
            unidade_medida: produtoInfo?.unidade_medida || 'Unidade',
            etiquetas: [],
            selecionadas: [],
            total_selecionado: 0,
          })
        }
        novo.get(chave)!.etiquetas.push(lote)
      })

      setEstoque(novo)
    } catch (err) {
      console.error('Erro:', err)
    } finally {
      setLoading(false)
    }
  }

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

  async function criarTransferencia() {
    const linhas = Array.from(estoque.values())
      .filter((p) => p.selecionadas.length > 0)
      .map((p) => ({
        produto_id: p.produto_id,
        nome_produto: p.produto_nome,
        unidade_medida: p.unidade_medida,
        qtd_ajustada: p.total_selecionado,
        etiquetas_selecionadas: p.selecionadas,
        aviso: null,
      }))

    if (linhas.length === 0) {
      alert('Selecione pelo menos um produto')
      return
    }

    setCriando(true)
    try {
      const response = await fetch('/api/romaneios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_entrega: new Date().toISOString().split('T')[0],
          status: 'rascunho',
          tipo: 'transferencia',
          criado_por: usuario?.id || null,
          unidade_destino: destino,
          linhas,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error)

      if (result.data?.id) {
        router.push(`/expedicao/transferencia/${result.data.id}`)
      }
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao criar transferência')
    } finally {
      setCriando(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando estoque...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Selecionar Estoque</h1>
            <p className="text-sm text-gray-600">Destinado para: {destinoLabel}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {estoque.size === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600">Nenhum produto disponível no estoque</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-6">
              {Array.from(estoque.values()).map((produto) => (
                <div key={produto.produto_id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandidas((prev) => ({
                        ...prev,
                        [produto.produto_id]: !prev[produto.produto_id],
                      }))
                    }
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <div className="text-left flex-1">
                      <p className="font-semibold text-gray-800">{produto.produto_nome}</p>
                      <p className="text-sm text-gray-600">
                        Disponível: {produto.etiquetas.length} etiquetas | Selecionado: {produto.total_selecionado}{' '}
                        {produto.unidade_medida}
                      </p>
                    </div>
                    <span className="text-blue-600 font-semibold">{produto.selecionadas.length} marcadas</span>
                  </button>

                  {expandidas[produto.produto_id] && (
                    <div className="border-t px-4 py-3 space-y-2 bg-gray-50">
                      {produto.etiquetas.map((etiqueta) => (
                        <label key={etiqueta.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded">
                          <input
                            type="checkbox"
                            checked={produto.selecionadas.includes(etiqueta.id)}
                            onChange={() => toggleEtiqueta(produto.produto_id, etiqueta.id)}
                            className="w-4 h-4"
                          />
                          <span className="text-sm">
                            {etiqueta.codigo_qr} · {etiqueta.quantidade || etiqueta.peso_gramas}{' '}
                            {produto.unidade_medida} · Val: {new Date(etiqueta.data_validade).toLocaleDateString('pt-BR')}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.back()}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={criarTransferencia}
                disabled={criando || Array.from(estoque.values()).every((p) => p.selecionadas.length === 0)}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {criando ? 'Criando...' : 'Confirmar Transferência'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
