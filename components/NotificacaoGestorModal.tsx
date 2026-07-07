'use client'
import { CheckCircle2 } from 'lucide-react'
import { NotificacaoGestor } from '@/hooks/useNotificacoesGestor'

interface NotificacaoGestorModalProps {
  notificacoes: NotificacaoGestor[]
  onFechar: () => void
}

export default function NotificacaoGestorModal({ notificacoes, onFechar }: NotificacaoGestorModalProps) {
  if (notificacoes.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">
            {notificacoes.length > 1 ? 'Tarefas concluídas pelo gestor' : 'Tarefa concluída pelo gestor'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Enquanto você esteve fora, seu gestor concluiu {notificacoes.length > 1 ? 'estas tarefas' : 'esta tarefa'} por você.
          </p>
        </div>

        <div className="p-6 space-y-3">
          {notificacoes.map((n) => (
            <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="font-semibold text-gray-800">{n.tarefa_titulo}</p>
              {n.mensagem && (
                <p className="text-sm text-gray-700 mt-2">
                  <span className="font-medium">Comentário do gestor:</span> {n.mensagem}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {n.criado_por && `${n.criado_por} · `}
                {new Date(n.created_at).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>

        <div className="p-6 pt-0">
          <button
            onClick={onFechar}
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
