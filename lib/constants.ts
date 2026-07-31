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

// Entidades financeiras: só as 3 reais do plano de contas (Paraisópolis,
// Itajubá, Rateio). Não usar LOCAL_LABEL aqui — aquele inclui "cozinha" como
// local físico de estoque/produção, um conceito diferente da entidade
// contábil (custos da cozinha entram como rateio, não como uma 4ª entidade).
export const UNIDADE_LABEL: Record<string, string> = {
  loja1: 'Paraisópolis',
  loja2: 'Itajubá',
  rateio: 'Rateio (Cozinha)',
}

// Status de conciliação bancária (financeiro_extrato_transacoes) — usado no
// selo de Despesas além da própria aba Conciliar Extrato, daí ficar aqui em
// vez de local a um componente só.
export const STATUS_CONCILIACAO_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  conciliado: 'Conciliado',
  ignorado: 'Ignorado',
}
export const STATUS_CONCILIACAO_COLOR: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  conciliado: 'bg-green-100 text-green-700',
  ignorado: 'bg-gray-100 text-gray-500',
}

// Etiqueta de aprovação de pagamento (financeiro_lancamentos) — recado
// entre admins, não é o status de pagamento em si (ver STATUS_LABEL).
export const ETIQUETA_APROVACAO_LABEL: Record<string, string> = {
  planejar_pagamento: 'Planejar pagamento',
  aprovada_pagamento: 'Aprovada p/ pagamento',
}
export const ETIQUETA_APROVACAO_COLOR: Record<string, string> = {
  planejar_pagamento: 'bg-amber-100 text-amber-700',
  aprovada_pagamento: 'bg-green-100 text-green-700',
}

// Status de revisão da Ficha Técnica (pré-preparos/produtos finais) —
// cozinha cria/edita como pendente até um admin aprovar.
export const STATUS_FICHA_TECNICA_LABEL: Record<string, string> = {
  aprovado: 'Aprovado',
  pendente_revisao: 'Pendente de Revisão',
}
export const STATUS_FICHA_TECNICA_COLOR: Record<string, string> = {
  aprovado: 'bg-green-100 text-green-700',
  pendente_revisao: 'bg-amber-100 text-amber-700',
}

export const FORMA_PAGAMENTO_LABEL: Record<string, string> = {
  boleto: 'Boleto',
  pix: 'PIX',
  cartao_debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro',
}

// Canal de RECEITA (Fluxo de Caixa) — 'pix'/'dinheiro' também existem em
// FORMA_PAGAMENTO_LABEL acima, mas com outro significado (forma de pagar
// uma DESPESA, não canal de uma entrada). Não confundir os dois vocabulários.
export const CATEGORIA_RECEITA_LABEL: Record<string, string> = {
  venda_cartao: 'Venda no Cartão',
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  repasse_ifood: 'Repasse iFood',
  repasse_aiqfome: 'Repasse Aiqfome',
  outros: 'Outros',
}

export const CONDICAO_PAGAMENTO_LABEL: Record<string, string> = {
  a_vista: 'À vista',
  a_prazo: 'A prazo',
}

export const TIPO_LANCAMENTO_LABEL: Record<string, string> = {
  despesa: 'Despesa',
  compra_insumos: 'Nota de Insumos',
}

// Status de pedido do PDV que contam como receita real. Só 'Finalizado -
// Pago' e 'Finalizado - Fiado' — exclui 'Em Andamento', 'Excluído' e
// 'Solicitou Fechamento'. Compartilhado entre lib/pdv-import.ts (aviso de
// status desconhecido) e lib/pdv-report.ts (filtro do relatório) para não
// desalinhar os dois.
export const PDV_STATUS_RECEITA = ['Finalizado - Pago', 'Finalizado - Fiado']

export const PDV_STATUS_CONHECIDOS = [
  'Finalizado - Pago',
  'Finalizado - Fiado',
  'Em Andamento',
  'Excluído',
  'Solicitou Fechamento',
]

// Idem para "Tipo de Item" — vocabulário do PDV, não CHECK no banco. 'Item de
// combo' tem valor real (não é um complemento gratuito) e entra nos
// relatórios igual a 'Produto'.
export const PDV_TIPO_ITEM_CONHECIDOS = ['Produto', 'Complemento', 'Item de combo']
