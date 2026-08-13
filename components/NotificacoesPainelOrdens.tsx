'use client'
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { OrdemNotificacao } from '@/lib/types'
import { textoNotificacaoOrdem, iconeNotificacaoOrdem } from '@/lib/ordens-notificacoes-utils'

interface NotificacoesPainelOrdensProps {
  notificacoes: OrdemNotificacao[]
  naoLidas: number
  marcarComoLidas: () => Promise<void>
  onAbrirOrdem: (ordemId: string) => void
  botaoClassName: string
}

function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

// Sino de notificações de Ordens — espelha components/NotificacoesPainel.tsx
// (Tarefas), tipado pra OrdemNotificacao em vez de generalizar o
// componente já em produção.
export default function NotificacoesPainelOrdens({
  notificacoes,
  naoLidas,
  marcarComoLidas,
  onAbrirOrdem,
  botaoClassName,
}: NotificacoesPainelOrdensProps) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function alternar() {
    const abrindo = !aberto
    setAberto(abrindo)
    if (abrindo && naoLidas > 0) marcarComoLidas()
  }

  return (
    <div ref={containerRef} className="relative">
      <button onClick={alternar} className={`relative ${botaoClassName}`} title="Notificações">
        <Bell size={16} />
        {naoLidas > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-bold text-gray-800">Notificações</p>
          </div>
          {notificacoes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Sem notificações ainda</p>
          ) : (
            notificacoes.map((n) => {
              const Icone = iconeNotificacaoOrdem(n.tipo)
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setAberto(false)
                    onAbrirOrdem(n.ordem_id)
                  }}
                  className={`w-full flex items-start gap-2.5 px-4 py-3 text-left border-b border-gray-50 last:border-0 hover:bg-gray-50 ${
                    !n.lida_em ? 'bg-blue-50/60' : ''
                  }`}
                >
                  <Icone size={16} className="flex-shrink-0 text-gray-500 mt-0.5" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-700">{textoNotificacaoOrdem(n)}</span>
                    <span className="block text-xs text-gray-400 mt-0.5">{tempoRelativo(n.created_at)}</span>
                  </span>
                  {!n.lida_em && <span className="w-2 h-2 rounded-full bg-pink-600 flex-shrink-0 mt-1.5" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
