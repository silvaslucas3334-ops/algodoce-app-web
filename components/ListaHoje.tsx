'use client'
import { Tarefa } from '@/lib/types'
import { getHoje } from '@/lib/tarefas-utils'
import TarefaCard from './TarefaCard'

interface ListaHojeProps {
  tarefas: Tarefa[]
  usuariosMap: Record<string, { nome: string; avatar?: string }>
  onCardClick: (tarefa: Tarefa) => void
}

export default function ListaHoje({
  tarefas,
  usuariosMap,
  onCardClick,
}: ListaHojeProps) {
  const hoje = getHoje()

  // Filtrar tarefas de hoje e atrasadas, não concluídas nem canceladas
  const tarefasHoje = tarefas.filter((t) => {
    const naoFinalizada = t.status !== 'concluida' && t.status !== 'cancelada'
    const ehHoje = t.data_vencimento === hoje
    const ehAtrasada = t.data_vencimento < hoje && naoFinalizada

    return naoFinalizada && (ehHoje || ehAtrasada)
  })

  const responsavelInfo = (userId: string) => ({
    nome: usuariosMap[userId]?.nome || 'Desconhecido',
    avatar: usuariosMap[userId]?.avatar,
  })

  if (tarefasHoje.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">Nenhuma tarefa para hoje 🎉</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {tarefasHoje.map((tarefa) => {
        const resp = responsavelInfo(tarefa.responsavel_atual_id)
        return (
          <TarefaCard
            key={tarefa.id}
            tarefa={tarefa}
            responsavelNome={resp.nome}
            responsavelAvatar={resp.avatar}
            onClick={() => onCardClick(tarefa)}
            tamanho="grande"
          />
        )
      })}
    </div>
  )
}
