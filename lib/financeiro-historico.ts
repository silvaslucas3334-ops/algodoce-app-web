import { supabase } from './supabase'
import { formatBRL } from './ofx'
import {
  CONDICAO_PAGAMENTO_LABEL,
  ETIQUETA_APROVACAO_LABEL,
  FORMA_PAGAMENTO_LABEL,
  TIPO_LANCAMENTO_LABEL,
  UNIDADE_LABEL,
} from './constants'

// Histórico de alterações de um lançamento (Fase 6a). Os registros são escritos por gatilhos
// no banco (lib/migrations/financeiro-fase6a-auditoria-lancamentos.sql); aqui só leitura.
// A RLS libera a tabela só para admin.

export type AcaoHistorico =
  | 'criado'
  | 'alterado'
  | 'pago'
  | 'cancelado'
  | 'reaberto'
  | 'item_adicionado'
  | 'item_alterado'
  | 'item_removido'

export interface EventoHistorico {
  id: string
  lancamento_id: string
  em: string
  usuario_id: string | null
  usuario_nome: string
  acao: AcaoHistorico
  item_nome: string | null
  /** Alterações: {campo: {de, para}}. Criado/item adicionado/removido: {campo: valor}. */
  mudancas: Record<string, any>
}

export const ACAO_ROTULO: Record<AcaoHistorico, string> = {
  criado: 'Criou o lançamento',
  alterado: 'Alterou',
  pago: 'Marcou como paga',
  cancelado: 'Cancelou',
  reaberto: 'Reabriu',
  item_adicionado: 'Adicionou item',
  item_alterado: 'Alterou item',
  item_removido: 'Removeu item',
}

export const ACAO_COR: Record<AcaoHistorico, string> = {
  criado: 'bg-blue-100 text-blue-700',
  alterado: 'bg-gray-100 text-gray-700',
  pago: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
  reaberto: 'bg-amber-100 text-amber-700',
  item_adicionado: 'bg-blue-100 text-blue-700',
  item_alterado: 'bg-gray-100 text-gray-700',
  item_removido: 'bg-red-100 text-red-700',
}

const ROTULO_CAMPO: Record<string, string> = {
  descricao: 'Descrição',
  valor_total: 'Valor',
  numero_documento: 'Documento',
  data_lancamento: 'Data do lançamento',
  data_vencimento: 'Vencimento',
  data_pagamento: 'Data do pagamento',
  data_competencia: 'Competência',
  status: 'Situação',
  forma_pagamento: 'Forma de pagamento',
  condicao_pagamento: 'Condição',
  parcela_num: 'Parcela',
  parcela_total: 'Total de parcelas',
  grupo_parcelamento: 'Parcelamento',
  recorrencia_id: 'Recorrência',
  unidade: 'Unidade',
  conta_id: 'Conta',
  parte_id: 'Fornecedor/beneficiário',
  extrato_transacao_id: 'Extrato bancário',
  observacoes: 'Observações',
  valor_juros_multa: 'Juros/multa',
  etiqueta_aprovacao: 'Etiqueta',
  valor_pago_conciliado: 'Valor conciliado',
  afeta_fluxo_caixa: 'Afeta o fluxo de caixa',
  tipo: 'Tipo',
  criado_por: 'Criado por',
  // itens
  quantidade: 'Quantidade',
  unidade_nota: 'Unidade da nota',
  fator_conversao: 'Fator de conversão',
  valor_unitario: 'Valor unitário',
  materia_prima: 'Insumo',
  lancamento_id: 'Nota',
}

const CAMPOS_DINHEIRO = new Set(['valor_total', 'valor_pago_conciliado', 'valor_juros_multa', 'valor_unitario'])
const CAMPOS_VINCULO = new Set(['extrato_transacao_id', 'recorrencia_id', 'grupo_parcelamento'])
const STATUS_ROTULO: Record<string, string> = { aberto: 'Em aberto', pago: 'Paga', cancelado: 'Cancelada' }

export interface NomesReferenciados {
  partes: Map<string, string>
  contas: Map<string, string>
}

function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function formatarValorCampo(campo: string, valor: any, nomes: NomesReferenciados): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (CAMPOS_DINHEIRO.has(campo)) return formatBRL(Number(valor))
  if (campo.startsWith('data_') && typeof valor === 'string') return formatarData(valor)
  if (campo === 'status') return STATUS_ROTULO[valor] || String(valor)
  if (campo === 'etiqueta_aprovacao') return ETIQUETA_APROVACAO_LABEL[valor] || String(valor)
  if (campo === 'unidade') return UNIDADE_LABEL[valor] || String(valor)
  if (campo === 'forma_pagamento') return FORMA_PAGAMENTO_LABEL[valor] || String(valor)
  if (campo === 'condicao_pagamento') return CONDICAO_PAGAMENTO_LABEL[valor] || String(valor)
  if (campo === 'tipo') return TIPO_LANCAMENTO_LABEL[valor] || String(valor)
  if (campo === 'parte_id') return nomes.partes.get(valor) || 'Fornecedor não encontrado'
  if (campo === 'conta_id') return nomes.contas.get(valor) || 'Conta não encontrada'
  if (campo === 'criado_por') return 'outro usuário'
  if (CAMPOS_VINCULO.has(campo)) return 'vinculado'
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não'
  return String(valor)
}

export interface LinhaMudanca {
  rotulo: string
  de?: string // ausente = valor único (criado / item adicionado / removido)
  para: string
}

/** Transforma o JSON de `mudancas` em linhas prontas para exibir. */
export function descreverMudancas(evento: EventoHistorico, nomes: NomesReferenciados): LinhaMudanca[] {
  const ehAlteracao = evento.acao === 'alterado' || evento.acao === 'pago' || evento.acao === 'cancelado' || evento.acao === 'reaberto' || evento.acao === 'item_alterado'
  const linhas: LinhaMudanca[] = []
  for (const [campo, conteudo] of Object.entries(evento.mudancas || {})) {
    // a ação já diz "marcou como paga/cancelou/reabriu": a linha de situação seria repetição
    if (campo === 'status' && (evento.acao === 'pago' || evento.acao === 'cancelado' || evento.acao === 'reaberto')) continue
    const rotulo = ROTULO_CAMPO[campo] || campo
    if (ehAlteracao && conteudo && typeof conteudo === 'object' && 'para' in conteudo) {
      // troca de insumo já vem com nomes; os demais campos passam pelo formatador
      const ehNome = campo === 'materia_prima'
      linhas.push({
        rotulo,
        de: ehNome ? String(conteudo.de ?? '—') : formatarValorCampo(campo, conteudo.de, nomes),
        para: ehNome ? String(conteudo.para ?? '—') : formatarValorCampo(campo, conteudo.para, nomes),
      })
    } else {
      linhas.push({ rotulo, para: formatarValorCampo(campo, conteudo, nomes) })
    }
  }
  return linhas
}

/** ids de fornecedor/conta citados nas mudanças (para buscar os nomes de uma vez). */
function idsReferenciados(eventos: EventoHistorico[], campo: 'parte_id' | 'conta_id'): string[] {
  const ids = new Set<string>()
  for (const e of eventos) {
    const c = e.mudancas?.[campo]
    if (!c) continue
    if (typeof c === 'object') {
      if (c.de) ids.add(c.de)
      if (c.para) ids.add(c.para)
    } else if (typeof c === 'string') ids.add(c)
  }
  return [...ids]
}

export async function buscarHistorico(
  lancamentoId: string
): Promise<{ eventos: EventoHistorico[]; nomes: NomesReferenciados; indisponivel: boolean }> {
  const vazio: NomesReferenciados = { partes: new Map(), contas: new Map() }
  const { data, error } = await supabase
    .from('financeiro_lancamentos_historico')
    .select('id, lancamento_id, em, usuario_id, usuario_nome, acao, item_nome, mudancas')
    .eq('lancamento_id', lancamentoId)
    .order('em', { ascending: false })
    .order('id')
    .limit(300)
  if (error) {
    // tabela ainda não criada (SQL da 6a não aplicado) ou sem permissão: a tela só esconde a seção
    console.error('Histórico indisponível:', error.message)
    return { eventos: [], nomes: vazio, indisponivel: true }
  }
  const eventos = (data || []) as EventoHistorico[]

  const idsPartes = idsReferenciados(eventos, 'parte_id')
  const idsContas = idsReferenciados(eventos, 'conta_id')
  const [partes, contas] = await Promise.all([
    idsPartes.length ? supabase.from('financeiro_partes').select('id, nome').in('id', idsPartes) : Promise.resolve({ data: [] as any[] }),
    idsContas.length ? supabase.from('financeiro_contas').select('id, codigo, nome').in('id', idsContas) : Promise.resolve({ data: [] as any[] }),
  ])
  const nomes: NomesReferenciados = {
    partes: new Map((partes.data || []).map((p: any) => [p.id, p.nome])),
    contas: new Map((contas.data || []).map((c: any) => [c.id, `${c.codigo} — ${c.nome}`])),
  }
  return { eventos, nomes, indisponivel: false }
}
