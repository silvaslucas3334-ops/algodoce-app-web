'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL, ROMANEIO_STATUS_LABEL } from '@/lib/constants'
import { buscarOrigemDoCriador, nomeUnidade, rotuloMotivo, Unidade } from '@/lib/expedicao'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, Loader, ArrowRightLeft, Printer } from 'lucide-react'

export default function ConfirmarTransferenciaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const romaneioId = params.romaneio_id as string

  const [romaneio, setRomaneio] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  const destinoLabel = romaneio ? LOCAL_LABEL[romaneio.unidade_destino as keyof typeof LOCAL_LABEL] || 'Desconhecido' : 'Carregando...'
  const [origem, setOrigem] = useState<Unidade | null>(null)

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

  // Envia a transferência numa operação única do banco: confere que todas as etiquetas ainda
  // estão no estoque da loja de origem e só então move tudo (etiquetas + status juntos ou nada).
  async function confirmarTransferencia() {
    if (!romaneio) return
    setConfirmando(true)
    setErroEnvio('')

    try {
      const { error } = await supabase.rpc('enviar_romaneio', { p_romaneio_id: romaneioId })
      if (error) throw error

      alert('✓ Transferência enviada!')
      router.push('/expedicao')
    } catch (err: any) {
      console.error('Erro ao enviar transferência:', err)
      setErroEnvio(err?.message || 'Erro desconhecido.')
    } finally {
      setConfirmando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando transferência...
      </div>
    )
  }

  if (!romaneio) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Transferência não encontrada
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
              Confirmar Transferência
            </h1>
            <p className="text-sm text-gray-600">
              De: {nomeUnidade(origem)} · Para: {destinoLabel}
              {romaneio?.motivo && <span> · Motivo: {rotuloMotivo(romaneio.motivo)}</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-700">
              <strong>Status:</strong> {ROMANEIO_STATUS_LABEL[romaneio.status] || romaneio.status}
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-800 mb-4">Produtos a Transferir</h2>
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

          {erroEnvio && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold">Não foi possível enviar. Nada foi gravado.</p>
              <p className="mt-0.5">{erroEnvio}</p>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              onClick={() => router.push(`/expedicao/transferencia/${romaneioId}/imprimir`)}
              className="px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-2"
            >
              <Printer size={18} />
              Imprimir
            </button>
            {romaneio.status === 'rascunho' && (
            <button
              onClick={confirmarTransferencia}
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
                  Confirmar Transferência
                </>
              )}
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
