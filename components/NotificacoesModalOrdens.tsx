'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { OrdemNotificacao } from '@/lib/types'
import { textoNotificacaoOrdem, iconeNotificacaoOrdem } from '@/lib/ordens-notificacoes-utils'

interface NotificacoesModalOrdensProps {
  usuarioId: string | undefined
  notificacoes: OrdemNotificacao[]
  carregando: boolean
  onFechar: () => Promise<void> | void
}

function chaveDoDia(usuarioId: string) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return `ordens_notif_modal_visto_${usuarioId}_${hoje}`
}

// Modal bloqueante que força pelo menos uma checada diária das
// notificações de ordem cancelada — espelha components/NotificacoesModal.tsx
// (Tarefas). Aparece no máximo 1x/dia por usuário.
export default function NotificacoesModalOrdens({ usuarioId, notificacoes, carregando, onFechar }: NotificacoesModalOrdensProps) {
  const [visivel, setVisivel] = useState(false)
  const naoLidas = notificacoes.filter((n) => !n.lida_em)

  useEffect(() => {
    if (carregando || !usuarioId || naoLidas.length === 0) return
    if (localStorage.getItem(chaveDoDia(usuarioId))) return
    setVisivel(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, usuarioId])

  if (!visivel || naoLidas.length === 0) return null

  async function fechar() {
    if (usuarioId) localStorage.setItem(chaveDoDia(usuarioId), '1')
    setVisivel(false)
    await onFechar()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">
            {naoLidas.length > 1 ? 'Novidades nas suas ordens' : 'Novidade na sua ordem'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {naoLidas.length > 1 ? `${naoLidas.length} atualizações desde a última vez` : '1 atualização desde a última vez'}
          </p>
        </div>

        <div className="p-6 space-y-3">
          {naoLidas.map((n) => {
            const Icone = iconeNotificacaoOrdem(n.tipo)
            return (
              <div key={n.id} className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                <Icone size={18} className="flex-shrink-0 text-red-700 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-800">{textoNotificacaoOrdem(n)}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-6 pt-0">
          <button
            onClick={fechar}
            className="w-full py-3 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            Ok, entendi
          </button>
        </div>
      </div>
    </div>
  )
}
