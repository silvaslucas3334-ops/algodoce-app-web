'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { buscarOrigemDoCriador, nomeUnidade, rotuloMotivo, Unidade } from '@/lib/expedicao'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, Loader, ArrowRightLeft } from 'lucide-react'

export default function ReceberTransferenciaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const romaneioId = params.romaneio_id as string

  const [romaneio, setRomaneio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [recebendo, setRecebendo] = useState(false)
  const [erroRecebimento, setErroRecebimento] = useState('')

  // "De:" é quem enviou a devolução (a unidade de quem criou). Antes mostrava
  // `unidade_destino`, que numa devolução é a própria cozinha.
  const [origem, setOrigem] = useState<Unidade | null>(null)
  const origemLabel = romaneio ? nomeUnidade(origem) : 'Carregando...'

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
        setOrigem(data.unidade_origem ?? (await buscarOrigemDoCriador(data.criado_por)))
      } catch (err) {
        console.error('Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarRomaneio()
  }, [romaneioId])

  // Recebe a devolução INTEIRA numa operação única do banco (etiquetas voltam ao estoque da
  // cozinha e o romaneio fecha juntos, ou nada é gravado).
  async function confirmarRecebimento() {
    if (!romaneio) return
    setRecebendo(true)
    setErroRecebimento('')

    try {
      const { error } = await supabase.rpc('receber_romaneio', { p_romaneio_id: romaneioId })
      if (error) throw error

      alert('✓ Devolução recebida com sucesso!')
      router.push('/expedicao')
    } catch (err: any) {
      console.error('Erro ao receber devolução:', err)
      setErroRecebimento(err?.message || 'Erro desconhecido.')
    } finally {
      setRecebendo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando devolução...
      </div>
    )
  }

  if (!romaneio) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Devolução não encontrada
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ArrowRightLeft size={24} />
              Confirmar Recebimento de Devolução
            </h1>
            <p className="text-sm text-gray-600">
              De: {origemLabel}
              {romaneio?.motivo && <span> · Motivo: {rotuloMotivo(romaneio.motivo)}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              <strong>Status:</strong> Aguardando recebimento
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-800 mb-4">Produtos a Receber</h2>
            <div className="space-y-3">
              {romaneio.linhas?.map((linha: any, idx: number) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-gray-800">{linha.nome_produto}</p>
                      <p className="text-sm text-gray-600">
                        Quantidade: {linha.qtd_ajustada} {linha.unidade_medida}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Etiquetas: {linha.etiquetas_selecionadas?.length || 0}
                      </p>
                    </div>
                    <CheckCircle size={24} className="text-green-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 uppercase font-semibold">Total de Produtos</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{romaneio.linhas?.length || 0}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 uppercase font-semibold">Total de Etiquetas</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {romaneio.linhas?.reduce((sum: number, l: any) => sum + (l.etiquetas_selecionadas?.length || 0), 0) || 0}
              </p>
            </div>
          </div>

          {erroRecebimento && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold">Não foi possível receber. Nada foi gravado.</p>
              <p className="mt-0.5">{erroRecebimento}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
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
                  Receber tudo
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
