'use client'
import { Tarefa } from '@/lib/types'
import { formatData, formatHora, isAtrasada, STATUS_INFO, getDiaSemana, getDiaMes } from '@/lib/tarefas-utils'
import { AlertTriangle } from 'lucide-react'

interface TarefaCardProps {
  tarefa: Tarefa
  responsavelNome?: string
  responsavelAvatar?: string
  criadoPorNome?: string // preenchido só quando o criador não é admin
  onClick?: () => void
  tamanho?: 'pequeno' | 'grande' // pequeno = agenda, grande = lista hoje
}

export default function TarefaCard({
  tarefa,
  responsavelNome = 'Não atribuído',
  responsavelAvatar,
  criadoPorNome,
  onClick,
  tamanho = 'pequeno',
}: TarefaCardProps) {
  const atrasada = isAtrasada(tarefa.data_vencimento, tarefa.hora_limite || null, tarefa.status)
  const statusInfo = STATUS_INFO[tarefa.status]

  // Barra de acento colorida por status (ou vermelho se atrasada)
  const accentColor = atrasada
    ? 'bg-red-500'
    : {
        pendente: 'bg-amber-400',
        pronta_revisao: 'bg-blue-500',
        concluida: 'bg-green-500',
        refazer_pendente: 'bg-red-500',
        cancelada: 'bg-gray-400',
      }[tarefa.status]

  if (tamanho === 'grande') {
    // Versão grande: para a lista de tarefas do dia
    return (
      <button
        onClick={onClick}
        className={`group relative w-full text-left rounded-xl overflow-hidden border transition-all hover:shadow-lg hover:-translate-y-0.5 ${
          atrasada ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
        }`}
      >
        {/* Barra de acento */}
        <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentColor}`} />

        <div className="flex items-start justify-between gap-3 p-4 pl-5">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-gray-800">{tarefa.titulo}</h3>
              {atrasada && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={12} /> Atrasada
                </span>
              )}
            </div>
            {tarefa.descricao && (
              <p className="text-sm text-gray-600 mb-3">{tarefa.descricao}</p>
            )}
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-1 rounded-full border font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              <span className="text-gray-500">👤 {responsavelNome}</span>
              {tarefa.hora_limite && (
                <span className="font-mono text-gray-500">
                  🕐 {formatHora(tarefa.hora_limite)}
                </span>
              )}
            </div>
            {criadoPorNome && (
              <p className="text-xs text-gray-400 mt-2">
                Criada por {criadoPorNome}
              </p>
            )}
          </div>
          {responsavelAvatar && (
            <img
              src={responsavelAvatar}
              alt={responsavelNome}
              className="w-10 h-10 rounded-full flex-shrink-0"
            />
          )}
        </div>
      </button>
    )
  }

  // Versão pequena: para agenda semanal
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border-2 transition-all hover:shadow-md text-left w-full ${
        atrasada
          ? 'border-red-300 bg-red-50'
          : `border-${statusInfo.color.split(' ')[0].replace('bg-', '')}-200 bg-white`
      }`}
    >
      <div className="flex items-start gap-2">
        {responsavelAvatar && (
          <img
            src={responsavelAvatar}
            alt={responsavelNome}
            className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 line-clamp-2">
            {tarefa.titulo}
          </p>
          <p className="text-xs text-gray-600 mt-1">{responsavelNome}</p>
          {tarefa.hora_limite && (
            <p className="text-xs text-gray-500 font-mono mt-1">
              {formatHora(tarefa.hora_limite)}
            </p>
          )}
        </div>
        {atrasada && <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />}
      </div>
    </button>
  )
}
