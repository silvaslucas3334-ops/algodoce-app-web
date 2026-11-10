// Fase 2 da conciliação de extrato — regras para a DIFERENÇA entre o que o banco debitou e o que
// as despesas selecionadas somam. Lógica pura (sem tela, sem banco) para ser testada à parte.
//
// Decisão do dono (10/11/2026): até R$ 1,00 de diferença passa sem justificativa; acima disso o
// usuário precisa escolher o que aconteceu: (a) ALTERAR O VALOR da despesa para o valor pago
// (faltou item, cancelaram algo, desconto, item a mais…), ou (b) registrar a diferença como
// JUROS/MULTA/TAXA, ou (c) pagamento PARCIAL (a despesa continua em aberto) — sempre com motivo.

/** R$ — diferença aceita sem justificativa (centavos, arredondamento). */
export const TOLERANCIA_DIFERENCA = 1

export type Resolucao = 'ajustar_valor' | 'juros_taxa' | 'parcial'
export type TipoAjuste = 'valor' | 'juros_taxa'

/** Ajuste gravado na despesa no momento da conciliação (delta com sinal: + banco pagou a mais). */
export interface AjusteConciliacao {
  lancamentoId: string
  tipo: TipoAjuste
  delta: number
  motivo: string
}

export interface AnaliseDiferenca {
  /** valor do banco − soma das despesas (positivo: o banco pagou a mais) */
  diferenca: number
  absoluta: number
  /** bate no centavo */
  bate: boolean
  /** diferente, mas dentro da tolerância: pode confirmar sem justificar */
  dentroDaTolerancia: boolean
  /** acima da tolerância: o usuário precisa escolher uma resolução + motivo */
  exigeResolucao: boolean
  /** diferença desproporcional (> R$ 100 e > 50% da soma): exige confirmação explícita */
  muitoGrande: boolean
  opcoes: Resolucao[]
}

export const arredondar2 = (n: number) => Math.round(n * 100) / 100

/**
 * @param valorBanco valor absoluto debitado no banco (soma das transações do banco)
 * @param somaDespesas soma dos saldos das despesas selecionadas
 * @param qtdDespesas quantas despesas estão selecionadas (pagamento parcial só faz sentido com 1)
 */
export function analisarDiferenca(valorBanco: number, somaDespesas: number, qtdDespesas: number): AnaliseDiferenca {
  const diferenca = arredondar2(valorBanco - somaDespesas)
  const absoluta = Math.abs(diferenca)
  const bate = absoluta < 0.01
  const exigeResolucao = absoluta > TOLERANCIA_DIFERENCA + 1e-9
  const dentroDaTolerancia = !bate && !exigeResolucao
  const muitoGrande = absoluta > Math.max(100, somaDespesas * 0.5)
  let opcoes: Resolucao[] = []
  if (exigeResolucao) {
    opcoes = diferenca > 0 ? ['ajustar_valor', 'juros_taxa'] : ['ajustar_valor']
    if (diferenca < 0 && qtdDespesas === 1) opcoes.push('parcial')
  }
  return { diferenca, absoluta, bate, dentroDaTolerancia, exigeResolucao, muitoGrande, opcoes }
}

export interface MotivoAjuste {
  id: string
  label: string
  exigeTexto?: boolean
}

export const MOTIVOS_REDUCAO: MotivoAjuste[] = [
  { id: 'item_faltou', label: 'Faltou item / item cancelado' },
  { id: 'desconto', label: 'Desconto negociado' },
  { id: 'devolucao', label: 'Devolução ou troca' },
  { id: 'outro', label: 'Outro motivo', exigeTexto: true },
]

export const MOTIVOS_ACRESCIMO: MotivoAjuste[] = [
  { id: 'item_a_mais', label: 'Item a mais / acréscimo no pedido' },
  { id: 'frete', label: 'Frete ou entrega' },
  { id: 'outro', label: 'Outro motivo', exigeTexto: true },
]

export const MOTIVOS_JUROS_TAXA: MotivoAjuste[] = [
  { id: 'juros_multa', label: 'Juros ou multa por atraso' },
  { id: 'taxa', label: 'Taxa ou tarifa' },
  { id: 'outro', label: 'Outro motivo', exigeTexto: true },
]

export function motivosDisponiveis(resolucao: Resolucao | null, diferenca: number): MotivoAjuste[] {
  if (resolucao === 'juros_taxa') return MOTIVOS_JUROS_TAXA
  if (resolucao === 'ajustar_valor') return diferenca < 0 ? MOTIVOS_REDUCAO : MOTIVOS_ACRESCIMO
  return []
}

/** Estado do formulário de ajuste (compartilhado pelos modais de conciliação). */
export interface AjusteEstado {
  resolucao: Resolucao | null
  motivoId: string
  motivoTexto: string
  /** em qual despesa aplicar o ajuste quando há mais de uma selecionada */
  alvoId: string
  confirmaGrande: boolean
}

export const AJUSTE_VAZIO: AjusteEstado = { resolucao: null, motivoId: '', motivoTexto: '', alvoId: '', confirmaGrande: false }

/** Texto final do motivo ("Faltou item — sem a embalagem de 1 kg"), ou null se ainda incompleto. */
export function motivoFinal(estado: AjusteEstado, diferenca: number): string | null {
  const lista = motivosDisponiveis(estado.resolucao, diferenca)
  const m = lista.find((x) => x.id === estado.motivoId)
  if (!m) return null
  const texto = estado.motivoTexto.trim()
  if (m.exigeTexto) return texto.length >= 3 ? texto : null
  return texto ? `${m.label} — ${texto}` : m.label
}

/** A escolha do usuário está completa para poder confirmar? */
export function ajusteValido(estado: AjusteEstado, analise: AnaliseDiferenca, temAlvo = true): boolean {
  if (!analise.exigeResolucao) return true
  if (!estado.resolucao || !analise.opcoes.includes(estado.resolucao)) return false
  if (analise.muitoGrande && !estado.confirmaGrande) return false
  if (estado.resolucao === 'parcial') return true
  if (!temAlvo) return false
  return motivoFinal(estado, analise.diferenca) !== null
}

/** Converte o estado do formulário no ajuste a gravar (ou undefined: sem ajuste/parcial). */
export function montarAjuste(estado: AjusteEstado, analise: AnaliseDiferenca, lancamentoId: string): AjusteConciliacao | undefined {
  if (!analise.exigeResolucao) return undefined
  if (estado.resolucao !== 'ajustar_valor' && estado.resolucao !== 'juros_taxa') return undefined
  const motivo = motivoFinal(estado, analise.diferenca)
  if (!motivo) return undefined
  return {
    lancamentoId,
    tipo: estado.resolucao === 'juros_taxa' ? 'juros_taxa' : 'valor',
    delta: analise.diferenca,
    motivo,
  }
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Linha registrada em `observacoes` da despesa (rastro: o que mudou e por quê). */
export function montarObservacaoAjuste(args: { dataISO: string; tipo: TipoAjuste; de: number; para: number; motivo: string }): string {
  const [y, m, d] = args.dataISO.split('-')
  const quando = `${d}/${m}/${y}`
  if (args.tipo === 'juros_taxa') {
    return `Conciliação bancária (${quando}): diferença de ${brl(args.para - args.de)} registrada como juros/taxa — ${args.motivo}`
  }
  return `Conciliação bancária (${quando}): valor ajustado de ${brl(args.de)} para ${brl(args.para)} — ${args.motivo}`
}

/** Junta uma nova linha ao texto de observações já existente (sem apagar o que havia). */
export function anexarObservacao(atual: string | null | undefined, linha: string): string {
  const base = (atual || '').trim()
  return base ? `${base}\n${linha}` : linha
}

// --- janela de plausibilidade para despesas JÁ PAGAS -------------------------------------------------
// As 5 conciliações com soma duplicada (R$ 1.237,97) nasceram da "combinação exata" pré-marcada sobre
// compras já pagas em junho, vinculadas a um débito de setembro. Uma despesa já paga só entra na
// sugestão se foi paga perto da data do débito.
export const JANELA_PAGAS_DIAS = 30

export function diasEntreISO(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((da - db) / 86400000)
}

/** Despesa já paga, mas com data de pagamento longe do débito do banco. */
export function pagaForaDaJanela(
  l: { status: string; data_pagamento?: string | null },
  dataTransacao: string,
  janelaDias = JANELA_PAGAS_DIAS
): boolean {
  if (l.status !== 'pago' || !l.data_pagamento) return false
  return Math.abs(diasEntreISO(l.data_pagamento, dataTransacao)) > janelaDias
}
