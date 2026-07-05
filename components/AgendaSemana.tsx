'use client'
import { Tarefa } from '@/lib/types'
import { getHoje, getDiaMes, getDiaSemana } from '@/lib/tarefas-utils'
import TarefaCard from './TarefaCard'

interface AgendaSemanaProps {
  tarefas: Tarefa[]
  usuariosMap: Record<string, { nome: string; avatar?: string }>
  onCardClick: (tarefa: Tarefa) => void
}

export default function AgendaSemana({
  tarefas,
  usuariosMap,
  onCardClick,
}: AgendaSemanaProps) {
  const hoje = new Date()
  const diasSemana = []

  // Gerar datas de segunda a domingo da semana atual
  // Segunda = índice 1, Domingo = índice 0
  // Recalcular: segunda-feira deve ser 0 no nosso cálculo
  const diaSemanaHoje = hoje.getDay() // 0 = domingo, 1 = segunda, etc
  const diasParaTrasMes = diaSemanaHoje === 0 ? 6 : diaSemanaHoje - 1 // segundas é 1, domingo é 6

  for (let i = 0; i < 7; i++) {
    const data = new Date(hoje)
    data.setDate(hoje.getDate() - diasParaTrasMes + i)
    diasSemana.push(data.toISOString().split('T')[0])
  }

  // Agrupar tarefas por dia
  const tarefasPorDia: Record<string, Tarefa[]> = {}
  diasSemana.forEach((dia) => {
    tarefasPorDia[dia] = tarefas.filter(
      (t) =>
        t.data_vencimento === dia &&
        t.status !== 'concluida' &&
        t.status !== 'cancelada'
    )
  })

  const diasLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
  const responsavelInfo = (userId: string) => ({
    nome: usuariosMap[userId]?.nome || 'Desconhecido',
    avatar: usuariosMap[userId]?.avatar,
  })

  return (
    <div className="grid grid-cols-7 gap-2">
      {diasSemana.map((dia, idx) => {
        const tarefa = tarefasPorDia[dia]
        const ehHoje = dia === getHoje()

        return (
          <div
            key={dia}
            className={`flex flex-col rounded-lg border-2 p-3 min-h-32 ${
              ehHoje
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="mb-3">
              <p className="text-xs font-bold text-gray-600">{diasLabels[idx]}</p>
              <p className="text-lg font-bold text-gray-800">
                {getDiaMes(dia)}
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto">
              {tarefa.length > 0 ? (
                tarefa.map((t) => {
                  const resp = responsavelInfo(t.responsavel_atual_id)
                  return (
                    <TarefaCard
                      key={t.id}
                      tarefa={t}
                      responsavelNome={resp.nome}
                      responsavelAvatar={resp.avatar}
                      onClick={() => onCardClick(t)}
                      tamanho="pequeno"
                    />
                  )
                })
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">
                  Sem tarefas
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
