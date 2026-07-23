import { MessageSquare, RotateCw, CheckCircle2, Plus, LucideIcon } from 'lucide-react'
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
      if (n.tarefa?.responsavel_atual_id === usuarioId) {
        return `${autor} comentou na tarefa "${titulo}", da qual você é responsável`
      }
      if (n.tarefa?.criado_por === usuarioId) {
        return `${autor} comentou na tarefa "${titulo}", que você criou`
      }
      return `${autor} comentou na tarefa "${titulo}", em que você está envolvido`
    }
    case 'feedback_refazer':
      return `"${titulo}" voltou para refazer${n.mensagem ? ` — feedback: "${n.mensagem}"` : ''}`
    case 'aprovada':
      return `"${titulo}" foi aprovada! 🎉`
    case 'concluida_por_gestor':
      return `${autor} concluiu "${titulo}" por você${n.mensagem ? ` — "${n.mensagem}"` : ''}`
    case 'nova_tarefa':
      return `${autor} criou uma nova tarefa para você: "${titulo}"`
    case 'concluida':
      return `${autor} concluiu "${titulo}", que você criou`
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
    case 'nova_tarefa':
      return Plus
    case 'aprovada':
    case 'concluida_por_gestor':
    case 'concluida':
      return CheckCircle2
  }
}
