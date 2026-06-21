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
