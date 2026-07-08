export const LOCAL_LABEL: Record<string, string> = {
  cozinha: 'Cozinha',
  loja1: 'Paraisópolis',
  loja2: 'Itajubá',
}

// Rótulo exibido ao usuário para cada status de romaneio. O valor interno
// no banco continua 'confirmado'/'em_estoque' — só o texto mostrado muda,
// para não dar a falsa impressão de que "confirmado" significa "recebido".
export const ROMANEIO_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  confirmado: 'Enviado',
  em_estoque: 'Recebido',
  cancelado: 'Cancelado',
}
