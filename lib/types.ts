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
