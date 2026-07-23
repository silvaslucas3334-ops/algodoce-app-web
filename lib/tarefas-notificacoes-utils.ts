import { MessageSquare, RotateCw, CheckCircle2, LucideIcon } from 'lucide-react'
import { TarefaNotificacao } from '@/lib/types'

/**
 * Texto exibido nunca fica pronto no banco — o mesmo evento 'comentario'
 * produz frase diferente pro responsável ("...da qual você é responsável")
 * vs. pro envolvido ("...em que você está envolvido"), então é montado
 * aqui a partir de tipo + a relação do destinatário (usuarioId) com a
 * tarefa. Usado tanto pelo modal bloqueante quanto pelo painel do sino,
 * pra não duplicar essa lógica nos dois lugares.
 */
export function textoNotificacao(n: TarefaNotificacao, usuarioId: string): string {
  const titulo = n.tarefa?.titulo || 'uma tarefa'
  const autor = n.criado_por || 'Alguém'

  switch (n.tipo) {
    case 'comentario': {
      const ehResponsavel = n.tarefa?.responsavel_atual_id === usuarioId
      return ehResponsavel
        ? `${autor} comentou na tarefa "${titulo}", da qual você é responsável`
        : `${autor} comentou na tarefa "${titulo}", em que você está envolvido`
    }
    case 'feedback_refazer':
      return `"${titulo}" voltou para refazer${n.mensagem ? ` — feedback: "${n.mensagem}"` : ''}`
    case 'aprovada':
      return `"${titulo}" foi aprovada! 🎉`
    case 'concluida_por_gestor':
      return `${autor} concluiu "${titulo}" por você${n.mensagem ? ` — "${n.mensagem}"` : ''}`
    default:
      return titulo
  }
}

export function iconeNotificacao(tipo: TarefaNotificacao['tipo']): LucideIcon {
  switch (tipo) {
    case 'comentario':
      return MessageSquare
    case 'feedback_refazer':
      return RotateCw
    case 'aprovada':
    case 'concluida_por_gestor':
      return CheckCircle2
  }
}
