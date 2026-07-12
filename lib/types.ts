export type Tipo = 'Produzido' | 'Insumo'
export type UnidadeMedida = 'Unidade' | 'Gramas' | 'Fatias'
export type StatusOrdem = 'pendente' | 'em_producao' | 'concluida' | 'cancelada'
export type StatusLote = 'na_cozinha' | 'enviado' | 'na_loja' | 'esgotado'
export type Local = 'cozinha' | 'loja1' | 'loja2'

export interface Produto {
  id: string
  nome: string
  tipo: Tipo
  unidade_medida: UnidadeMedida
  validade_dias: number
  congelado: boolean
  fatias_porcoes: number
  ativo: boolean
  created_at: string
}

export interface OrdemProducao {
  id: string
  produto_id: string
  produto?: Produto
  quantidade: number
  loja_destino: 'loja1' | 'loja2' | 'cozinha'
  status: StatusOrdem
  solicitado_por: string
  observacao?: string
  created_at: string
  updated_at: string
}

export interface LoteProducao {
  id: string
  codigo_qr: string
  produto_id: string
  produto?: Produto
  ordem_id?: string
  quantidade: number
  peso_gramas?: number
  data_producao: string
  data_validade: string
  produzido_por: string
  destino: Local
  status: StatusLote
  created_at: string
}

export interface MovimentacaoEstoque {
  id: string
  lote_id: string
  lote?: LoteProducao
  tipo: 'entrada' | 'saida' | 'transferencia'
  local_origem?: Local
  local_destino?: Local
  quantidade: number
  registrado_por: string
  created_at: string
}

export interface EstoqueItem {
  produto_id: string
  produto?: Produto
  local: Local
  quantidade_total: number
  lotes: LoteProducao[]
}

// MÓDULO DE TAREFAS
export type StatusTarefa = 'pendente' | 'pronta_revisao' | 'concluida' | 'refazer_pendente' | 'cancelada'

export interface Setor {
  id: string
  nome: string
  tipo: 'operacional' | 'administrativo'
  ativo: boolean
  created_at: string
}

export interface Tarefa {
  id: string
  titulo: string
  descricao?: string
  setor_id: string
  setor?: Setor
  status: StatusTarefa
  data_vencimento: string
  hora_limite?: string
  criado_por: string
  responsavel_original_id: string
  responsavel_atual_id: string
  foto_obrigatoria: boolean
  tentativa_num: number
  concluido_em?: string
  criado_em: string
  updated_at: string
  recorrencia_id?: string
}

export interface TarefaEvidencia {
  id: string
  tarefa_id: string
  tentativa_num: number
  foto_url: string
  data_upload: string
  uploaded_by: string
}

export interface TarefaHistorico {
  id: string
  tarefa_id: string
  alteracao_tipo: 'status_change' | 'reatribuicao' | 'cancelamento' | 'edicao' | 'triagem'
  dados_json: Record<string, any>
  registrado_por: string
  created_at: string
}

export interface TarefaComentario {
  id: string
  tarefa_id: string
  usuario_id: string
  texto: string
  tipo: 'comentario' | 'feedback_refazer'
  tentativa_num: number
  created_at: string
}

export type FrequenciaRecorrencia = 'diaria' | 'semanal' | 'mensal'

export interface TarefaRecorrencia {
  id: string
  titulo: string
  descricao?: string
  setor_id: string
  responsavel_id: string
  foto_obrigatoria: boolean
  hora_limite?: string
  frequencia: FrequenciaRecorrencia
  dias_semana?: number[] // semanal: 0=Segunda .. 6=Domingo
  dia_mes?: number // mensal: 1..31
  proxima_data: string
  data_inicio?: string
  data_fim?: string
  ativa: boolean
  criado_por: string
  created_at: string
  updated_at: string
}

// MÓDULO FINANCEIRO
// Entidades reais do plano de contas: 0116=Paraisópolis, 0205=Itajubá,
// 0001=Rateio. A cozinha não é uma 4ª entidade — seus custos entram como
// rateio (0001), já que não são atribuídos a uma loja específica.
export type UnidadeFinanceiro = 'loja1' | 'loja2' | 'rateio'
export type StatusFinanceiro = 'aberto' | 'pago' | 'cancelado'
export type StatusConciliacao = 'pendente' | 'conciliado' | 'ignorado'
export type FormaPagamento = 'boleto' | 'pix' | 'cartao_debito' | 'dinheiro'
export type CondicaoPagamento = 'a_vista' | 'a_prazo'
export type TipoLancamento = 'despesa' | 'compra_insumos'

export interface FinanceiroParte {
  id: string
  nome: string
  documento: string // CPF/CNPJ obrigatório — chave do match com o extrato
  papel_fornecedor: boolean
  papel_beneficiario: boolean
  forma_pagamento_padrao?: FormaPagamento
  condicao_pagamento: CondicaoPagamento
  prazo_dias?: number // 7 | 15 | 30, quando a prazo
  telefone?: string
  email?: string
  observacoes?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface FinanceiroCentroCusto {
  id: string
  codigo: string
  nome: string
  ativo: boolean
  created_at: string
}

export interface FinanceiroConta {
  id: string
  codigo: string
  nome: string
  centro_custo_id: string
  centro_custo?: FinanceiroCentroCusto
  grupo_dre: string
  aplicavel_a: 'compras_insumos' | 'despesas_gerais' | 'ambos'
  ativo: boolean
  created_at: string
}

export interface FinanceiroMateriaPrima {
  id: string
  nome: string
  unidade_medida: string
  unidade_compra: string
  fator_conversao: number
  conta_id?: string // conta contábil padrão do item; cada compra herda esta conta no lançamento
  conta?: FinanceiroConta
  descricao?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

// Tabela ÚNICA de lançamentos financeiros: despesa manual OU nota de compra
// de insumos (que gera a sua "despesa" automaticamente; itens em
// FinanceiroLancamentoItem alimentam o CMV).
export interface FinanceiroLancamento {
  id: string
  tipo: TipoLancamento
  parte_id: string
  parte?: FinanceiroParte
  descricao: string
  valor_total: number
  numero_documento?: string
  data_lancamento: string // data da compra/competência
  data_vencimento: string
  data_pagamento?: string
  status: StatusFinanceiro
  forma_pagamento?: FormaPagamento
  condicao_pagamento?: CondicaoPagamento
  parcela_num?: number
  parcela_total?: number
  grupo_parcelamento?: string
  recorrencia_id?: string
  unidade: UnidadeFinanceiro
  conta_id?: string // obrigatória quando tipo='despesa' (CHECK no banco)
  conta?: FinanceiroConta
  extrato_transacao_id?: string
  observacoes?: string
  criado_por: string
  created_at: string
  updated_at: string
  itens?: FinanceiroLancamentoItem[]
}

export interface FinanceiroLancamentoItem {
  id: string
  lancamento_id: string
  materia_prima_id: string
  materia_prima?: FinanceiroMateriaPrima
  quantidade: number // na unidade_nota
  unidade_nota: string // unidade impressa na NF
  fator_conversao: number // unidade_medida por 1 unidade_nota
  valor_unitario: number
  valor_total: number
  conta_id?: string
  conta?: FinanceiroConta
  created_at: string
}

export interface FinanceiroRecorrencia {
  id: string
  parte_id: string
  parte?: FinanceiroParte
  descricao: string
  valor: number
  dia_vencimento: number // 1..28
  forma_pagamento?: FormaPagamento
  unidade: UnidadeFinanceiro
  conta_id: string
  conta?: FinanceiroConta
  ativa: boolean
  proxima_data: string
  criado_por: string
  created_at: string
  updated_at: string
}

export interface FinanceiroExtratoTransacao {
  id: string
  conta_bancaria: string
  fitid: string
  data: string
  valor: number
  descricao_original: string
  documento_extraido?: string
  parte_id?: string
  lancamento_id?: string
  status_conciliacao: StatusConciliacao
  importado_por: string
  importado_em: string
}

export interface FinanceiroCustoMedioMensal {
  materia_prima_id: string
  mes_referencia: string
  materia_prima_nome: string
  unidade_medida: string
  quantidade_convertida: number // já em unidade_medida (qtd × fator por linha)
  valor_total: number
  custo_medio_por_unidade_medida: number
  numero_compras: number
}

export interface CandidatoConciliacao {
  lancamento: FinanceiroLancamento
  confianca: 'alta' | 'media' | 'baixa'
}

// Import do PDV — pedidos/itens importados dos exports do sistema de PDV.
// unidade aqui é só loja1/loja2 (o export é por loja, não existe pedido
// "rateio"/cozinha). status é texto livre validado em lib/pdv-import.ts,
// não um union fechado — vocabulário controlado pelo fornecedor do PDV.
export interface FinanceiroPdvPedido {
  id: string
  unidade: 'loja1' | 'loja2'
  codigo: string
  data_abertura: string
  data_fechamento?: string
  data_periodo: string
  status: string
  tot_itens?: number
  servico: number
  desconto: number
  valor_entrega: number
  total: number
  total_recebido?: number
  forma_pagamento?: string
  nota_emitida?: boolean
  serie_nf?: string
  numero_nf?: string
  importado_por: string
  importado_em: string
  itens?: FinanceiroPdvItem[]
}

export interface FinanceiroPdvItem {
  id: string
  pedido_id: string
  ordem_pedido: number
  data_hora_item: string
  quantidade: number
  valor_unitario: number
  valor_total_item: number
  tipo_item: 'Produto' | 'Complemento'
  nome_produto: string
  tipo_produto?: string
  categoria_produto?: string
  codigo_produto_pdv?: string
  importado_em: string
}

// Linha achatada do relatório "Itens Vendidos" — gerada em tempo de consulta
// (lib/pdv-report.ts), nunca persistida. Ver nota em financeiro_pdv_pedidos:
// os ajustes do pedido (entrega/desconto/acréscimo/NF) só aparecem na
// primeira linha de cada pedido, replicando a coluna "X" da planilha manual.
export interface ItemVendidoFlat {
  dataHoraItem: string
  nomeProduto: string
  tipoProduto: string | null
  categoriaProduto: string | null
  quantidade: number
  valorUnitario: number
  valorTotalItem: number
  codPedido: string
  taxaEntrega: number
  desconto: number
  acrescimo: number
  numeroNf: string | null
  valorFinal: number
}

export interface FaturamentoPorCategoria {
  categoria: string
  quantidade: number
  valorFinal: number
  percentual: number
}
