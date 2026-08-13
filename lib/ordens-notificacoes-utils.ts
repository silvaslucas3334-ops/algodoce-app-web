import { XCircle, LucideIcon } from 'lucide-react'
import { OrdemNotificacao } from './types'

/**
 * Texto exibido pra notificação de ordem — mesmo padrão de
 * lib/tarefas-notificacoes-utils.ts (montado aqui, não fica pronto no
 * banco), só que hoje só existe um tipo ('cancelada').
 */
export function textoNotificacaoOrdem(n: OrdemNotificacao): string {
  const produto = n.ordem?.produto?.nome || 'um item'
  const numero = n.ordem?.numero_ordem
  const autor = n.criado_por || 'A cozinha'
  switch (n.tipo) {
    case 'cancelada':
      return `${autor} cancelou sua ordem${numero ? ` #${numero}` : ''} de ${produto}${
        n.mensagem ? ` — motivo: "${n.mensagem}"` : ''
      }`
    default:
      return 'Atualização na sua ordem'
  }
}

export function iconeNotificacaoOrdem(tipo: OrdemNotificacao['tipo']): LucideIcon {
  switch (tipo) {
    case 'cancelada':
      return XCircle
  }
}
