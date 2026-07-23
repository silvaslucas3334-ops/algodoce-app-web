'use client'
import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { TarefaNotificacao } from '@/lib/types'
import { textoNotificacao, iconeNotificacao } from '@/lib/tarefas-notificacoes-utils'

interface NotificacoesModalProps {
  usuarioId: string | undefined
  notificacoes: TarefaNotificacao[]
  carregando: boolean
  onFechar: () => Promise<void> | void
}

function chaveDoDia(usuarioId: string) {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return `tarefas_notif_modal_visto_${usuarioId}_${hoje}`
}

// Modal bloqueante que força pelo menos uma checada diária das notificações
// (comentário, refazer, aprovação, conclusão pelo gestor) — aparece no
// máximo 1x/dia por usuário (controle em localStorage, mesmo padrão já
// usado pelo flag de fake-auth em dev). O acesso contínuo é o painel do
// sino (components/NotificacoesPainel.tsx), que não bloqueia nada.
export default function NotificacoesModal({ usuarioId, notificacoes, carregando, onFechar }: NotificacoesModalProps) {
  const [visivel, setVisivel] = useState(false)
  const naoLidas = notificacoes.filter((n) => !n.lida_em)

  useEffect(() => {
    if (carregando || !usuarioId || naoLidas.length === 0) return
    if (localStorage.getItem(chaveDoDia(usuarioId))) return
    setVisivel(true)
    // Só decide se mostra quando os dados terminam de carregar pela
    // primeira vez — não reabre sozinho se o usuário já fechou hoje e uma
    // notificação nova chega via Realtime enquanto o app está aberto.
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
            {naoLidas.length > 1 ? 'Novidades nas suas tarefas' : 'Novidade na sua tarefa'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {naoLidas.length > 1 ? `${naoLidas.length} atualizações desde a última vez` : '1 atualização desde a última vez'}
          </p>
        </div>

        <div className="p-6 space-y-3">
          {naoLidas.map((n) => {
            const Icone = iconeNotificacao(n.tipo)
            return (
              <div key={n.id} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <Icone size={18} className="flex-shrink-0 text-amber-700 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-800">{usuarioId ? textoNotificacao(n, usuarioId) : ''}</p>
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
