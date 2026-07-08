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
export type UnidadeFinanceiro = 'cozinha' | 'loja1' | 'loja2' | 'rateio'
export type StatusFinanceiro = 'aberto' | 'pago' | 'cancelado'
export type StatusConciliacao = 'pendente' | 'conciliado' | 'ignorado'

export interface FinanceiroParte {
  id: string
  nome: string
  documento?: string
  papel_fornecedor: boolean
  papel_beneficiario: boolean
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

export interface FinanceiroCompraInsumo {
  id: string
  materia_prima_id: string
  materia_prima?: FinanceiroMateriaPrima
  fornecedor_id: string
  fornecedor?: FinanceiroParte
  numero_nota_fiscal?: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  data_compra: string
  data_pagamento?: string
  unidade: UnidadeFinanceiro
  conta_id?: string
  conta?: FinanceiroConta
  status: StatusFinanceiro
  forma_pagamento?: string
  extrato_transacao_id?: string
  observacoes?: string
  criado_por: string
  created_at: string
  updated_at: string
}

export interface FinanceiroDespesa {
  id: string
  parte_id: string
  parte?: FinanceiroParte
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento?: string
  unidade: UnidadeFinanceiro
  conta_id?: string
  conta?: FinanceiroConta
  status: StatusFinanceiro
  forma_pagamento?: string
  numero_documento?: string
  extrato_transacao_id?: string
  observacoes?: string
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
  tipo_match?: 'compra_insumo' | 'despesa_geral'
  compra_insumo_id?: string
  despesa_id?: string
  status_conciliacao: StatusConciliacao
  importado_por: string
  importado_em: string
}

export interface FinanceiroCustoMedioMensal {
  materia_prima_id: string
  mes_referencia: string
  materia_prima_nome: string
  unidade_medida: string
  unidade_compra: string
  fator_conversao: number
  quantidade_total: number
  valor_total: number
  custo_medio_por_unidade_compra: number
  custo_medio_por_unidade_medida: number
  numero_compras: number
}

// Candidato de conciliação: normalmente 1 registro, mas uma NF com vários
// itens vira várias linhas de compra pagas num boleto só — nesse caso o
// candidato agrupa todas as linhas da nota (registros.length > 1) e o match
// é pela SOMA dos valores, não pelo valor de cada linha.
export interface CandidatoConciliacao {
  tipo: 'compra_insumo' | 'despesa_geral'
  registros: (FinanceiroCompraInsumo | FinanceiroDespesa)[]
  numero_nota_fiscal?: string // preenchido quando é grupo de NF multi-item
  confianca: 'alta' | 'media' | 'baixa'
}
