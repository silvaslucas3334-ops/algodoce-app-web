'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, Loader, PackageCheck } from 'lucide-react'

interface LinhaConferencia {
  produto_id: string
  nome_produto: string
  unidade_medida: string
  qtd_ajustada: number
  etiquetas_selecionadas: string[]
  totalEtiquetas: number
  jaRecebida: boolean // todas as etiquetas dessa linha já estão na_loja
}

export default function ReceberRomaneioPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const romaneioId = params.romaneio_id as string

  const [romaneio, setRomaneio] = useState<any>(null)
  const [linhas, setLinhas] = useState<LinhaConferencia[]>([])
  const [conferidas, setConferidas] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [recebendo, setRecebendo] = useState(false)

  useEffect(() => {
    const carregarRomaneio = async () => {
      try {
        const { data, error } = await supabase
          .from('romaneios')
          .select('*')
          .eq('id', romaneioId)
          .single()

        if (error) throw error
        setRomaneio(data)

        // Verificar status atual de cada etiqueta para saber o que já foi recebido
        const todosLoteIds: string[] = (data.linhas || []).flatMap(
          (l: any) => l.etiquetas_selecionadas || []
        )

        const statusPorLote = new Map<string, string>()
        if (todosLoteIds.length > 0) {
          const { data: lotesData } = await supabase
            .from('lotes_producao')
            .select('id, status')
            .in('id', todosLoteIds)

          lotesData?.forEach((l: any) => statusPorLote.set(l.id, l.status))
        }

        const linhasConferencia: LinhaConferencia[] = (data.linhas || []).map((linha: any) => {
          const etiquetas = linha.etiquetas_selecionadas || []
          const jaRecebida =
            etiquetas.length > 0 && etiquetas.every((id: string) => statusPorLote.get(id) === 'na_loja')
          return {
            produto_id: linha.produto_id,
            nome_produto: linha.nome_produto,
            unidade_medida: linha.unidade_medida,
            qtd_ajustada: linha.qtd_ajustada,
            etiquetas_selecionadas: etiquetas,
            totalEtiquetas: etiquetas.length,
            jaRecebida,
          }
        })

        setLinhas(linhasConferencia)
        // Pré-marcar linhas já recebidas anteriormente (parcial)
        const conferidasIniciais: Record<string, boolean> = {}
        linhasConferencia.forEach((l) => {
          if (l.jaRecebida) conferidasIniciais[l.produto_id] = true
        })
        setConferidas(conferidasIniciais)
      } catch (err) {
        console.error('Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarRomaneio()
  }, [romaneioId])

  function toggleConferida(produtoId: string, jaRecebida: boolean) {
    if (jaRecebida) return // já recebida em uma conferência anterior, não desmarca
    setConferidas((prev) => ({ ...prev, [produtoId]: !prev[produtoId] }))
  }

  async function confirmarRecebimento() {
    if (!romaneio) return

    // Linhas marcadas agora que ainda não tinham sido recebidas
    const linhasParaReceber = linhas.filter((l) => conferidas[l.produto_id] && !l.jaRecebida)

    if (linhasParaReceber.length === 0) {
      alert('Marque ao menos um produto conferido para receber.')
      return
    }

    setRecebendo(true)
    try {
      const lotesIds = linhasParaReceber.flatMap((l) => l.etiquetas_selecionadas)

      if (lotesIds.length > 0) {
        const { error: errorLotes } = await supabase
          .from('lotes_producao')
          .update({ status: 'na_loja' })
          .in('id', lotesIds)

        if (errorLotes) throw errorLotes

        for (const loteId of lotesIds) {
          await supabase.from('movimentacoes_estoque').insert({
            lote_id: loteId,
            tipo: 'entrada',
            local_origem: 'cozinha',
            local_destino: romaneio.unidade_destino,
            quantidade: 1,
            registrado_por: usuario?.nome || 'Sistema',
          })
        }
      }

      // Romaneio só vira "em_estoque" quando TODAS as linhas estiverem conferidas
      const todasConferidas = linhas.every((l) => l.jaRecebida || conferidas[l.produto_id])
      if (todasConferidas) {
        await supabase
          .from('romaneios')
          .update({ status: 'em_estoque', atualizado_em: new Date().toISOString() })
          .eq('id', romaneioId)
      }

      alert(
        todasConferidas
          ? '✓ Romaneio recebido com sucesso!'
          : '✓ Itens conferidos recebidos. Os produtos não conferidos continuam pendentes.'
      )
      router.push('/expedicao')
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao receber romaneio')
    } finally {
      setRecebendo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando romaneio...
      </div>
    )
  }

  if (!romaneio) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Romaneio não encontrado
      </div>
    )
  }

  const totalProdutos = linhas.length
  const totalConferidos = linhas.filter((l) => l.jaRecebida || conferidas[l.produto_id]).length
  const totalEtiquetas = linhas.reduce((sum, l) => sum + l.totalEtiquetas, 0)
  const totalEtiquetasConferidas = linhas
    .filter((l) => l.jaRecebida || conferidas[l.produto_id])
    .reduce((sum, l) => sum + l.totalEtiquetas, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Conferir Recebimento</h1>
            <p className="text-sm text-gray-600">
              Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Progresso */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">
              {totalConferidos} de {totalProdutos} produtos conferidos
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {totalEtiquetasConferidas} de {totalEtiquetas} etiquetas
            </p>
          </div>
          <PackageCheck size={28} className="text-blue-400" />
        </div>

        <p className="text-sm text-gray-600 mb-3">
          Confira fisicamente cada produto recebido e marque a caixa correspondente.
        </p>

        {/* Lista de produtos */}
        <div className="space-y-3 mb-6">
          {linhas.map((linha) => {
            const marcada = linha.jaRecebida || !!conferidas[linha.produto_id]
            return (
              <label
                key={linha.produto_id}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${
                  linha.jaRecebida
                    ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                    : marcada
                    ? 'bg-green-50 border-green-400 cursor-pointer'
                    : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  disabled={linha.jaRecebida}
                  onChange={() => toggleConferida(linha.produto_id, linha.jaRecebida)}
                  className="w-6 h-6 accent-green-600 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{linha.nome_produto}</p>
                  <p className="text-sm text-gray-600">
                    Quantidade: {linha.qtd_ajustada} {linha.unidade_medida} · Etiquetas: {linha.totalEtiquetas}
                  </p>
                  {linha.jaRecebida && (
                    <p className="text-xs text-gray-500 mt-0.5">Já recebido anteriormente</p>
                  )}
                </div>
                {marcada && <CheckCircle size={22} className="text-green-600 flex-shrink-0" />}
              </label>
            )
          })}
        </div>

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={() => router.back()}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            onClick={confirmarRecebimento}
            disabled={recebendo}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {recebendo ? (
              <>
                <Loader size={18} className="animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Confirmar Recebimento
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
