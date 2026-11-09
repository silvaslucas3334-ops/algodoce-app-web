import { supabase } from './supabase'
import { LOCAL_LABEL } from './constants'

// Apoio da tela de Expedição (romaneios): origem, motivo da transferência, progresso de
// recebimento e idade do envio.
//
// Origem: desde a fase 7a a tabela `romaneios` guarda `unidade_origem`. Para romaneios antigos
// (sem a coluna preenchida) a origem continua sendo deduzida:
//   - tipo 'envio'         → sempre sai da cozinha;
//   - tipo 'transferencia' → a unidade de quem criou (usuarios.role/loja_id).
// Transferência antiga criada por admin não deixa rastro → origem null ("não registrada").

export type Unidade = 'cozinha' | 'loja1' | 'loja2'
export const UNIDADES: Unidade[] = ['cozinha', 'loja1', 'loja2']

// Motivo da transferência (fase 7a). Quem recebe, valida fisicamente e encontra divergência,
// cria ele mesmo uma transferência de volta para a cozinha informando o motivo.
export type MotivoTransferencia = 'transferencia' | 'devolucao_saldo' | 'devolucao_problema'

export const MOTIVOS_TRANSFERENCIA: { key: MotivoTransferencia; label: string; descricao: string; paraCozinha: boolean }[] = [
  { key: 'transferencia', label: 'Transferência simples', descricao: 'De uma loja para a outra.', paraCozinha: false },
  { key: 'devolucao_saldo', label: 'Devolução de saldo', descricao: 'O produto não veio fisicamente: devolve o saldo para a cozinha.', paraCozinha: true },
  { key: 'devolucao_problema', label: 'Devolução de produto com problema', descricao: 'Avaria, vencido ou errado: volta para a cozinha.', paraCozinha: true },
]

export function motivoValido(m: string | null | undefined): m is MotivoTransferencia {
  return MOTIVOS_TRANSFERENCIA.some((x) => x.key === m)
}

export function motivoEhDevolucao(m: string | null | undefined): boolean {
  return m === 'devolucao_saldo' || m === 'devolucao_problema'
}

export function rotuloMotivo(m: string | null | undefined): string {
  return MOTIVOS_TRANSFERENCIA.find((x) => x.key === m)?.label || 'Transferência simples'
}

/** Destinos permitidos para o motivo: simples = a outra loja; devoluções = cozinha. */
export function destinosDoMotivo(motivo: MotivoTransferencia, origem: Unidade | null | undefined): Unidade[] {
  if (motivoEhDevolucao(motivo)) return ['cozinha']
  return (['loja1', 'loja2'] as Unidade[]).filter((l) => l !== origem)
}

/** Mensagem de erro se a combinação motivo/origem/destino não é permitida; null se está ok. */
export function validarTransferencia(
  motivo: string | null | undefined,
  origem: string | null | undefined,
  destino: string | null | undefined
): string | null {
  if (!motivoValido(motivo)) return 'Escolha o motivo da transferência.'
  if (origem !== 'loja1' && origem !== 'loja2') return 'Não foi possível identificar a loja de origem.'
  if (!destino) return 'Escolha o destino.'
  if (destino === origem) return 'O destino não pode ser a própria unidade de origem.'
  if (!destinosDoMotivo(motivo, origem as Unidade).includes(destino as Unidade)) {
    return motivoEhDevolucao(motivo)
      ? 'Devoluções sempre voltam para a cozinha.'
      : 'Transferência simples é entre lojas. Para devolver à cozinha, escolha um dos motivos de devolução.'
  }
  return null
}

export interface RomaneioBase {
  id: string
  tipo: 'envio' | 'transferencia'
  status: 'rascunho' | 'confirmado' | 'em_estoque' | 'cancelado'
  unidade_origem?: Unidade | null
  unidade_destino: Unidade
  motivo?: MotivoTransferencia | null
  data_entrega: string
  linhas: any[] | null
  criado_por: string | null
  criado_em: string
  confirmado_em?: string | null
  atualizado_em?: string | null
}

export interface RomaneioEnriquecido extends RomaneioBase {
  origem: Unidade | null
  rotulo: 'Envio' | 'Transferência' | 'Devolução'
  produtosTotal: number
  etiquetasTotal: number
  // Só fazem sentido com status 'confirmado' (enviado e ainda não fechado):
  produtosPendentes: number // linhas com alguma etiqueta ainda em trânsito
  etiquetasPendentes: number // etiquetas ainda `enviado`
  idadeDias: number | null // dias desde o envio
}

const dataSP = (timestamp: string) => new Date(timestamp).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

function diasEntre(isoInicio: string, isoFim: string): number {
  const [a1, m1, d1] = isoInicio.split('-').map(Number)
  const [a2, m2, d2] = isoFim.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000)
}

/** Texto de idade do envio ("Enviado hoje", "Enviado há 3 dias"). */
export function rotuloIdade(dias: number): string {
  if (dias <= 0) return 'Enviado hoje'
  if (dias === 1) return 'Enviado ontem'
  return `Enviado há ${dias} dias`
}

export function origemDoUsuario(u: { role?: string; loja_id?: string | null } | null | undefined): Unidade | null {
  if (!u) return null
  if (u.role === 'loja' && (u.loja_id === 'loja1' || u.loja_id === 'loja2')) return u.loja_id
  if (u.role === 'cozinha') return 'cozinha'
  return null // admin (ou perfil sem unidade): não dá pra saber
}

/** Origem de uma transferência a partir de quem criou (usado nas telas de detalhe). */
export async function buscarOrigemDoCriador(criadoPor: string | null | undefined): Promise<Unidade | null> {
  if (!criadoPor) return null
  const { data } = await supabase.from('usuarios').select('id, role, loja_id').eq('id', criadoPor).maybeSingle()
  return origemDoUsuario(data)
}

export function nomeUnidade(u: Unidade | null | undefined): string {
  return u ? LOCAL_LABEL[u] || u : 'Origem não registrada'
}

/** Ids de todas as etiquetas que estão a caminho (status 'enviado'), em blocos de 1000. */
async function etiquetasEmTransito(): Promise<Set<string>> {
  const ids = new Set<string>()
  let inicio = 0
  while (true) {
    const { data, error } = await supabase
      .from('lotes_producao')
      .select('id')
      .eq('status', 'enviado')
      .order('id')
      .range(inicio, inicio + 999)
    if (error) throw error
    ;(data || []).forEach((l: any) => ids.add(l.id))
    if (!data || data.length < 1000) break
    inicio += 1000
  }
  return ids
}

/** Acrescenta origem, rótulo, progresso de recebimento e idade a linhas cruas de `romaneios`. */
export async function enriquecerRomaneios(linhas: RomaneioBase[]): Promise<RomaneioEnriquecido[]> {
  // Só precisa descobrir a origem pelo criador nos romaneios antigos (sem unidade_origem gravada).
  const idsCriadores = Array.from(
    new Set(linhas.filter((r) => r.tipo === 'transferencia' && !r.unidade_origem && r.criado_por).map((r) => r.criado_por as string))
  )
  const precisaProgresso = linhas.some((r) => r.status === 'confirmado')

  const [usuarios, emTransito] = await Promise.all([
    idsCriadores.length > 0
      ? supabase.from('usuarios').select('id, role, loja_id').in('id', idsCriadores).then((r) => r.data || [])
      : Promise.resolve([] as any[]),
    precisaProgresso ? etiquetasEmTransito() : Promise.resolve(new Set<string>()),
  ])
  const usuarioPorId = new Map<string, any>(usuarios.map((u: any) => [u.id, u]))
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  return linhas.map((r) => {
    const linhasRomaneio = Array.isArray(r.linhas) ? r.linhas : []
    const idsPorLinha: string[][] = linhasRomaneio.map((l: any) => (Array.isArray(l.etiquetas_selecionadas) ? l.etiquetas_selecionadas : []))
    const etiquetasTotal = idsPorLinha.reduce((s, ids) => s + ids.length, 0)
    const etiquetasPendentes = idsPorLinha.reduce((s, ids) => s + ids.filter((id) => emTransito.has(id)).length, 0)
    const produtosPendentes = idsPorLinha.filter((ids) => ids.some((id) => emTransito.has(id))).length

    const origem: Unidade | null =
      r.unidade_origem ?? (r.tipo === 'envio' ? 'cozinha' : origemDoUsuario(r.criado_por ? usuarioPorId.get(r.criado_por) : null))

    const enviadoEm = r.confirmado_em || r.atualizado_em || r.criado_em
    return {
      ...r,
      origem,
      rotulo: r.tipo === 'envio' ? 'Envio' : motivoEhDevolucao(r.motivo) || r.unidade_destino === 'cozinha' ? 'Devolução' : 'Transferência',
      produtosTotal: linhasRomaneio.length,
      etiquetasTotal,
      produtosPendentes,
      etiquetasPendentes,
      idadeDias: r.status === 'confirmado' && enviadoEm ? Math.max(0, diasEntre(dataSP(enviadoEm), hoje)) : null,
    }
  })
}

/** Romaneios que ainda pedem ação (rascunho ou enviado e não fechado). */
export async function carregarRomaneiosAtivos(): Promise<RomaneioEnriquecido[]> {
  const { data, error } = await supabase
    .from('romaneios')
    .select('*')
    .in('status', ['rascunho', 'confirmado'])
    .order('data_entrega', { ascending: true })
  if (error) throw error
  return enriquecerRomaneios((data || []) as RomaneioBase[])
}
