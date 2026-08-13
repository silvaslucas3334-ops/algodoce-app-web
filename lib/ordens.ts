import { supabase } from './supabase'

/**
 * Cancela uma ordem de produção com motivo, e notifica quem pediu (se a
 * ordem tiver solicitado_por_id — ordens antigas, de antes dessa coluna
 * existir, ficam sem notificação, só o cancelamento mesmo). Não notifica
 * quando quem cancela é a mesma pessoa que pediu (caso de Ordem Interna,
 * que a própria cozinha cria e pode cancelar).
 */
export async function cancelarOrdem(
  ordemId: string,
  motivo: string,
  usuarioQueCancela: { id: string; nome: string }
): Promise<void> {
  const { data: ordem, error: erroOrdem } = await supabase
    .from('ordens_producao')
    .select('id, solicitado_por_id')
    .eq('id', ordemId)
    .single()
  if (erroOrdem) throw new Error(erroOrdem.message)

  const { error } = await supabase
    .from('ordens_producao')
    .update({ status: 'cancelada', motivo_cancelamento: motivo, updated_at: new Date().toISOString() })
    .eq('id', ordemId)
  if (error) throw new Error(error.message)

  if (ordem.solicitado_por_id && ordem.solicitado_por_id !== usuarioQueCancela.id) {
    const { error: erroNotificacao } = await supabase.from('ordens_notificacoes').insert({
      ordem_id: ordemId,
      usuario_id: ordem.solicitado_por_id,
      tipo: 'cancelada',
      mensagem: motivo,
      criado_por: usuarioQueCancela.nome,
    })
    if (erroNotificacao) console.error('Erro ao notificar cancelamento de ordem:', erroNotificacao.message)
  }
}
