'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, AlertCircle, Loader } from 'lucide-react'

interface LoteComValidade {
  id: string
  codigo_qr: string
  produto_id: string
  quantidade: number
  peso_gramas: number | null
  data_validade: string
  status: string
  destino: string
}

interface ProdutoSugestao {
  produto_id: string
  nome_produto: string
  unidade_medida: string
  qtd_pedida: number
  qtd_sugerida: number
  qtd_ajustada: number
  ordem_ids: string[]
  etiquetas_disponiveis: LoteComValidade[]
  etiquetas_selecionadas: string[] // IDs dos lotes
  aviso: string | null
}

export default function NovoRomaneioPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const [dataEntrega, setDataEntrega] = useState('')
  const [unidadeDestino, setUnidadeDestino] = useState('loja1')
  const [ordens, setOrdens] = useState<any[]>([])
  const [linhas, setLinhas] = useState<ProdutoSugestao[]>([])
  const [lotes, setLotes] = useState<LoteComValidade[]>([])
  const [loading, setLoading] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})

  // Data mínima = hoje
  const hoje = new Date().toISOString().split('T')[0]

  // Buscar ordens quando data_entrega muda
  useEffect(() => {
    if (!dataEntrega) return

    const buscarOrdens = async () => {
      setLoading(true)
      try {
        // Buscar ordens com essa data de entrega E para a unidade de destino selecionada
        const { data: ordensData, error: ordensErr } = await supabase
          .from('ordens_producao')
          .select('id, numero_ordem, produto_id, quantidade, loja_destino, produto:produtos(nome, unidade_medida)')
          .eq('data_entrega', dataEntrega)
          .eq('loja_destino', unidadeDestino)
          .in('status', ['pendente', 'em_producao'])
          .order('numero_ordem')

        if (ordensErr) {
          console.error('Erro ao buscar ordens:', ordensErr)
          throw ordensErr
        }

        // Buscar lotes disponíveis APENAS para a unidade de destino selecionada (FEFO)
        const { data: lotesData, error: lotesErr } = await supabase
          .from('lotes_producao')
          .select('id, codigo_qr, produto_id, quantidade, peso_gramas, data_validade, status, destino')
          .eq('status', 'na_cozinha')
          .eq('destino', unidadeDestino)
          .order('data_validade')

        if (lotesErr) {
          console.error('Erro ao buscar lotes:', lotesErr)
          throw lotesErr
        }

        console.log('Ordens carregadas:', ordensData?.length || 0)
        console.log('Lotes carregados:', lotesData?.length || 0)

        setOrdens(ordensData || [])
        setLotes(lotesData || [])

        // Gerar sugestões
        gerarSugestoes(ordensData || [], lotesData || [])
      } catch (err) {
        console.error('Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    buscarOrdens()
  }, [dataEntrega])

  function gerarSugestoes(ordensData: any[], lotesData: LoteComValidade[]) {
    // Agrupar ordens por produto
    const produtosAgrupados: Record<string, any> = {}

    ordensData.forEach((ordem) => {
      const chave = ordem.produto_id
      if (!produtosAgrupados[chave]) {
        produtosAgrupados[chave] = {
          produto_id: ordem.produto_id,
          nome_produto: ordem.produto?.nome || 'Desconhecido',
          unidade_medida: ordem.produto?.unidade_medida || 'Unidade',
          qtd_pedida: 0,
          ordem_ids: [],
        }
      }
      produtosAgrupados[chave].qtd_pedida += ordem.quantidade
      produtosAgrupados[chave].ordem_ids.push(ordem.id)
    })

    // Gerar linhas com FEFO automático
    const novasLinhas: ProdutoSugestao[] = Object.values(produtosAgrupados).map((prod) => {
      // Buscar lotes disponíveis deste produto, ordenado por validade (FEFO)
      const lotesProduto = lotesData
        .filter((l) => l.produto_id === prod.produto_id)
        .sort((a, b) => a.data_validade.localeCompare(b.data_validade))

      // Seleção FEFO automática
      let qtdAcumulada = 0
      const etiquetasSelecionadas: string[] = []
      let qtdSugerida = 0

      for (const lote of lotesProduto) {
        qtdAcumulada += lote.quantidade || lote.peso_gramas || 0
        etiquetasSelecionadas.push(lote.id)
        qtdSugerida = qtdAcumulada

        // Parar quando atingir/ultrapassar a quantidade pedida
        if (qtdAcumulada >= prod.qtd_pedida) break
      }

      const aviso =
        qtdSugerida < prod.qtd_pedida
          ? `Sugerido ${qtdSugerida} de ${prod.qtd_pedida} — ${prod.qtd_pedida - qtdSugerida} faltam`
          : null

      return {
        produto_id: prod.produto_id,
        nome_produto: prod.nome_produto,
        unidade_medida: prod.unidade_medida,
        qtd_pedida: prod.qtd_pedida,
        qtd_sugerida: qtdSugerida,
        qtd_ajustada: qtdSugerida,
        ordem_ids: prod.ordem_ids,
        etiquetas_disponiveis: lotesProduto,
        etiquetas_selecionadas: etiquetasSelecionadas,
        aviso,
      }
    })

    setLinhas(novasLinhas)
  }

  function toggleEtiqueta(produtoId: string, loteId: string) {
    setLinhas((prev) =>
      prev.map((linha) =>
        linha.produto_id === produtoId
          ? {
              ...linha,
              etiquetas_selecionadas: linha.etiquetas_selecionadas.includes(loteId)
                ? linha.etiquetas_selecionadas.filter((id) => id !== loteId)
                : [...linha.etiquetas_selecionadas, loteId],
              qtd_ajustada: linha.etiquetas_selecionadas.includes(loteId)
                ? linha.qtd_ajustada -
                  (linha.etiquetas_disponiveis.find((e) => e.id === loteId)?.quantidade ||
                    linha.etiquetas_disponiveis.find((e) => e.id === loteId)?.peso_gramas ||
                    0)
                : linha.qtd_ajustada +
                  (linha.etiquetas_disponiveis.find((e) => e.id === loteId)?.quantidade ||
                    linha.etiquetas_disponiveis.find((e) => e.id === loteId)?.peso_gramas ||
                    0),
            }
          : linha
      )
    )
  }

  async function criarRomaneio() {
    if (!dataEntrega) {
      alert('Informe a data de entrega')
      return
    }

    console.log('Usuário:', usuario?.id, usuario?.nome)
    console.log('Linhas a inserir:', linhas.length)

    const linhasComDados = linhas.map((linha) => ({
      produto_id: linha.produto_id,
      nome_produto: linha.nome_produto,
      unidade_medida: linha.unidade_medida,
      qtd_pedida: linha.qtd_pedida,
      qtd_sugerida: linha.qtd_sugerida,
      qtd_ajustada: linha.qtd_ajustada,
      ordem_ids: linha.ordem_ids,
      etiquetas_selecionadas: linha.etiquetas_selecionadas,
      aviso: linha.aviso,
    }))

    setSalvando(true)
    try {
      // Usar endpoint backend em vez de client direto (evita RLS)
      const response = await fetch('/api/romaneios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_entrega: dataEntrega,
          status: 'rascunho',
          criado_por: usuario?.id || null, // Endpoint vai gerar UUID
          unidade_destino: unidadeDestino,
          linhas: linhasComDados,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Erro API:', result.error)
        throw new Error(result.error || 'Erro ao criar romaneio')
      }

      if (result.data?.id) {
        console.log('Romaneio criado:', result.data.id)
        router.push(`/expedicao/${result.data.id}`)
      } else {
        throw new Error('Sem ID retornado')
      }
    } catch (err) {
      console.error('Erro ao criar romaneio:', err instanceof Error ? err.message : String(err))
      alert('Erro ao criar romaneio: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold text-gray-800">Novo Romaneio</h1>
          </div>
          <div className="text-xs bg-red-50 border border-red-200 rounded px-3 py-2 text-red-700">
            <p>⚠️ <strong>Modo Teste:</strong> RLS desabilitado temporariamente</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Step 1: Seleção de Data + Unidade */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar size={18} />
              Data de Entrega
            </label>
            <input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
              min={hoje}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              📍 Unidade de Destino
            </label>
            <select
              value={unidadeDestino}
              onChange={(e) => setUnidadeDestino(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="loja1">Paraisópolis</option>
              <option value="loja2">Itajubá</option>
            </select>
          </div>

          {dataEntrega && (
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={() => router.back()}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => router.push(`/expedicao/novo/${dataEntrega}/${unidadeDestino}`)}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Próximo: Selecionar Estoque
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
