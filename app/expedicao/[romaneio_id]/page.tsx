'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Printer, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function VisualizarRomaneioPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const romaneioId = params.romaneio_id as string

  const [romaneio, setRomaneio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [expandidas, setExpandidas] = useState<Record<string, boolean>>({})

  // Carregar romaneio
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
      } catch (err) {
        console.error('Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarRomaneio()
  }, [romaneioId])

  async function confirmarRomaneio() {
    if (!romaneio) return
    setConfirmando(true)

    try {
      // Para cada produto no romaneio, marcar etiquetas como enviado
      for (const linha of romaneio.linhas) {
        // Atualizar lotes para status 'enviado' e destino correto
        await supabase
          .from('lotes_producao')
          .update({ status: 'enviado', destino: romaneio.unidade_destino })
          .in('id', linha.etiquetas_selecionadas)

        // Registrar movimentações para a unidade de destino
        for (const loteId of linha.etiquetas_selecionadas) {
          await supabase.from('movimentacoes_estoque').insert({
            lote_id: loteId,
            tipo: 'transferencia',
            local_origem: 'cozinha',
            local_destino: romaneio.unidade_destino,
            quantidade: 1,
            registrado_por: usuario?.nome || 'Sistema',
          })
        }

        // Criar aviso de parcial se necessário
        if (linha.aviso) {
          // Salvar aviso no histórico de romaneios (via tabela auxiliar ou JSON)
        }
      }

      // Atualizar status do romaneio
      await supabase
        .from('romaneios')
        .update({
          status: 'confirmado',
          confirmado_por: usuario?.id,
          confirmado_em: new Date().toISOString(),
        })
        .eq('id', romaneioId)

      alert('✓ Romaneio confirmado e etiquetas marcadas como enviado')
      router.push('/expedicao')
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao confirmar romaneio')
    } finally {
      setConfirmando(false)
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

  const isPrintView = typeof window !== 'undefined' && window.location.pathname.includes('/imprimir')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      {!isPrintView && (
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Romaneio {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                </h1>
                <p className="text-sm text-gray-600">
                  {romaneio.status === 'rascunho' ? '📝 Rascunho' : '✓ Confirmado'}
                  {romaneio.unidade_destino && (
                    <span className="ml-3 inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                      📍 {romaneio.unidade_destino === 'loja1' ? 'Paraisópolis' : 'Itajubá'}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-semibold flex items-center gap-2"
              >
                <Printer size={18} />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Info */}
        {!isPrintView && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-700">
              <strong>Total de produtos:</strong> {romaneio.linhas?.length || 0} •{' '}
              <strong>Etiquetas selecionadas:</strong> {romaneio.linhas?.reduce((sum: number, l: any) => sum + l.etiquetas_selecionadas.length, 0)}
            </p>
          </div>
        )}

        {/* Linhas do Romaneio */}
        <div className="space-y-4">
          {romaneio.linhas?.map((linha: any, idx: number) => (
            <div key={idx} className="bg-white rounded-lg border border-gray-200">
              {/* Header (Expandível) */}
              {!isPrintView && (
                <button
                  onClick={() =>
                    setExpandidas((prev) => ({
                      ...prev,
                      [idx]: !prev[idx],
                    }))
                  }
                  className="w-full px-6 py-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-100"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-bold text-gray-800 text-lg">{linha.nome_produto}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Pedido: <span className="font-semibold">{linha.qtd_pedida}</span> {linha.unidade_medida} | Enviando:{' '}
                        <span className="font-semibold">{linha.qtd_ajustada}</span>
                      </p>
                    </div>
                    {linha.aviso && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 ml-4">
                        <p className="text-xs text-amber-700 font-semibold">⚠️ {linha.aviso}</p>
                      </div>
                    )}
                  </div>
                </button>
              )}

              {/* Conteúdo (Expandido ou Print) */}
              {(isPrintView || expandidas[idx]) && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Etiquetas Selecionadas ({linha.etiquetas_selecionadas.length}):
                  </p>
                  <div className="space-y-2">
                    {linha.etiquetas_selecionadas.map((loteId: string, i: number) => {
                      const lote = linha.etiquetas_disponiveis?.find((e: any) => e.id === loteId)
                      return (
                        <div
                          key={i}
                          className="p-2 bg-white border border-gray-200 rounded flex items-center justify-between"
                        >
                          <div className="text-sm">
                            <p className="font-mono text-gray-800">{lote?.codigo_qr || 'QR'}</p>
                            <p className="text-xs text-gray-600">
                              {lote?.quantidade || lote?.peso_gramas} {linha.unidade_medida} • Val:{' '}
                              {new Date(lote?.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="text-right">
                            <input
                              type="checkbox"
                              checked={true}
                              readOnly
                              className="w-5 h-5 accent-green-600"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Saldo */}
                  {!isPrintView && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm text-blue-700">
                        <strong>Saldo na cozinha:</strong> {linha.qtd_pedida - linha.qtd_ajustada} {linha.unidade_medida}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Botões de Ação */}
        {!isPrintView && romaneio.status === 'rascunho' && (
          <div className="mt-6 flex gap-3 sticky bottom-6">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              onClick={confirmarRomaneio}
              disabled={confirmando}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {confirmando ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Confirmar Romaneio & Marcar Enviado
                </>
              )}
            </button>
          </div>
        )}

        {/* Status Confirmado */}
        {romaneio.status === 'confirmado' && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 font-semibold flex items-center gap-2">
              <CheckCircle size={20} />
              ✓ Romaneio confirmado em {new Date(romaneio.confirmado_em).toLocaleDateString('pt-BR')} às{' '}
              {new Date(romaneio.confirmado_em).toLocaleTimeString('pt-BR')}
            </p>
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            background: white;
          }
          .bg-gray-50,
          .bg-blue-50,
          .bg-amber-50,
          .bg-green-50 {
            background: white !important;
            border: 1px solid #ccc !important;
          }
          .space-y-4 > * + * {
            margin-top: 0.5rem;
          }
          .page-break {
            page-break-before: always;
          }
        }
        @page {
          size: 80mm auto;
          margin: 4mm;
        }
      `}</style>
    </div>
  )
}
