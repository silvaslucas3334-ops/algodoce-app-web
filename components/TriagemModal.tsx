'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Tarefa } from '@/lib/types'
import { X, ChevronRight, Calendar, Clock, Loader } from 'lucide-react'
import { formatData, formatHora, isAtrasada } from '@/lib/tarefas-utils'

interface TriagemModalProps {
  usuarioAtualId: string
  usuarioRole: string
  setorId: string
  usuarios: { id: string; nome: string }[]
  onClose: () => void
  onAbrirTarefa: (tarefa: Tarefa) => void
  onDone: () => void
}

export default function TriagemModal({
  usuarioAtualId,
  usuarioRole,
  setorId,
  usuarios,
  onClose,
  onAbrirTarefa,
  onDone,
}: TriagemModalProps) {
  const [atrasadas, setAtrasadas] = useState<Tarefa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [indiceAtual, setIndiceAtual] = useState(0)
  const [processando, setProcessando] = useState(false)

  // Busca atrasadas do banco em tempo real
  useEffect(() => {
    carregarAtrasadas()

    // Subscribe para mudanças em tempo real
    const channel = supabase
      .channel(`tarefas-${setorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tarefas',
          filter: `setor_id=eq.${setorId}`,
        },
        () => {
          carregarAtrasadas()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [setorId])

  async function carregarAtrasadas() {
    setCarregando(true)
    try {
      const { data, error } = await supabase
        .from('tarefas')
        .select('*')
        .eq('setor_id', setorId)
        .neq('status', 'concluida')
        .neq('status', 'cancelada')

      if (error) throw error

      if (!data) {
        setAtrasadas([])
        setCarregando(false)
        return
      }

      // Filtra apenas atrasadas relevantes para este usuário
      const tarefasAtrasadas = data.filter((t: Tarefa) => {
        const atrasada = isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)
        if (!atrasada) return false
        if (usuarioRole === 'admin') return true
        return t.responsavel_atual_id === usuarioAtualId
      })

      setAtrasadas(tarefasAtrasadas)
      setCarregando(false)

      // Se não há mais atrasadas, fecha o modal
      if (tarefasAtrasadas.length === 0) {
        onClose()
      }
    } catch (err) {
      console.error('Erro ao carregar atrasadas:', err)
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 flex items-center justify-center gap-3">
          <Loader size={20} className="animate-spin text-blue-600" />
          <p className="text-gray-700 font-medium">Verificando tarefas atrasadas...</p>
        </div>
      </div>
    )
  }

  if (atrasadas.length === 0) {
    return null
  }

  const tarefaAtual = atrasadas[indiceAtual]
  const responsavel = usuarios.find((u) => u.id === tarefaAtual.responsavel_atual_id)

  const proximaTarefa = () => {
    if (indiceAtual < atrasadas.length - 1) {
      setIndiceAtual(indiceAtual + 1)
    } else {
      onDone()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">⚠️ Tarefas Atrasadas</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
          <div className="flex-1 bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-red-600 h-full transition-all"
              style={{ width: `${((indiceAtual + 1) / atrasadas.length) * 100}%` }}
            />
          </div>
          <span className="font-semibold whitespace-nowrap">
            {indiceAtual + 1} de {atrasadas.length}
          </span>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm font-semibold text-red-800">{tarefaAtual.titulo}</p>
          <p className="text-xs text-red-700 mt-1">{responsavel?.nome || 'Desconhecido'}</p>
          <div className="flex gap-3 mt-2 text-xs text-red-600">
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatData(tarefaAtual.data_vencimento)}
            </span>
            {tarefaAtual.hora_limite && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatHora(tarefaAtual.hora_limite)}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          <button
            onClick={() => {
              onAbrirTarefa(tarefaAtual)
              proximaTarefa()
            }}
            disabled={processando}
            className="w-full py-2 px-3 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Abrir tarefa
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          onClick={proximaTarefa}
          disabled={processando}
          className="w-full py-2 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-900 disabled:opacity-50"
        >
          {indiceAtual === atrasadas.length - 1 ? 'Fechar' : 'Próxima'}
        </button>
      </div>
    </div>
  )
}
