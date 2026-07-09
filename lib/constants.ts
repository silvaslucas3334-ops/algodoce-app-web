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

// Status interno no banco é aberto/pago/cancelado; na tela, "aberto" vira
// "Planejada" ou "Atrasada" conforme o vencimento (calculado na hora, não
// persistido — mesmo padrão do indicador de tarefas atrasadas).
export const FINANCEIRO_STATUS_LABEL: Record<string, string> = {
  aberto: 'Planejada',
  pago: 'Paga',
  cancelado: 'Cancelada',
}

export const UNIDADE_LABEL: Record<string, string> = {
  ...LOCAL_LABEL,
  rateio: 'Rateio (compartilhado)',
}

export const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  boleto: 'Boleto',
  pix: 'PIX',
  cartao_debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro',
}

export const CONDICAO_PAGAMENTO_LABEL: Record<string, string> = {
  a_vista: 'À vista',
  a_prazo: 'A prazo',
}

export const TIPO_LANCAMENTO_LABEL: Record<string, string> = {
  despesa: 'Despesa',
  compra_insumos: 'Nota de Insumos',
}
