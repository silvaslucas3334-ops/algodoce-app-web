import { normalizarTitulo, detectarPadraoRecorrencia, labelDiasSemana } from './tarefas-utils'

export interface TransacaoOFX {
  data: string // YYYY-MM-DD
  valor: number // negativo = saída (pagamento)
  nome: string
  fitid: string | null // <FITID> do OFX, usado como chave de dedupe na conciliação de extrato
}

export type FrequenciaPagamento = 'diaria' | 'semanal' | 'mensal'

export interface PagamentoRecorrente {
  chave: string
  nome: string
  valorUltimo: number // último valor (pode variar)
  valorMedio: number // média dos valores
  ocorrencias: number
  frequencia: FrequenciaPagamento
  diasSemana: number[] // semanal: 0=Seg..6=Dom
  diaMes: number // mensal
  proximaData: string // YYYY-MM-DD
}

function extrairTag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : null
}

/**
 * Extrai transações de um arquivo OFX (formato SGML, não é XML estrito).
 */
export function parseOFX(texto: string): TransacaoOFX[] {
  const blocos = texto.split(/<STMTTRN>/i).slice(1)

  const transacoes: TransacaoOFX[] = []
  for (const bloco of blocos) {
    const dtRaw = extrairTag(bloco, 'DTPOSTED')
    const amtRaw = extrairTag(bloco, 'TRNAMT')
    const nome = extrairTag(bloco, 'NAME') || extrairTag(bloco, 'MEMO') || 'Beneficiário'
    const fitidRaw = extrairTag(bloco, 'FITID')
    if (!dtRaw || !amtRaw) continue

    const data = `${dtRaw.substring(0, 4)}-${dtRaw.substring(4, 6)}-${dtRaw.substring(6, 8)}`
    const valor = parseFloat(amtRaw.replace(',', '.'))
    if (isNaN(valor)) continue

    transacoes.push({ data, valor, nome: nome.trim(), fitid: fitidRaw ? fitidRaw.trim() : null })
  }
  return transacoes
}

export interface OFXConta {
  bankId: string | null
  acctId: string | null
  cnpj: string | null
}

// CNPJ pontuado obrigatório: o cabeçalho do OFX (antes do primeiro
// <STMTTRN>) tem outras tags puramente numéricas de 14 dígitos (ex:
// <DTSTART>20240601000000) que colidiriam com um regex de CNPJ sem
// separador. Um CNPJ real em texto livre (ex: dentro de <ORG>) quase
// sempre vem formatado, então exigir pontuação elimina esse falso positivo.
const RE_CNPJ_HEADER = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/

/**
 * Extrai identificadores da CONTA (não da transação) do cabeçalho do OFX —
 * o trecho antes do primeiro <STMTTRN>, hoje descartado por parseOFX
 * (split(...).slice(1)). BANKID/ACCTID quase sempre presentes num extrato
 * de banco brasileiro; CNPJ do titular é oportunista (nem todo banco expõe
 * esse dado no arquivo). Ver fingerprintOFX para como isso vira uma chave
 * estável de "qual conta é esta".
 */
export function parseOFXConta(texto: string): OFXConta {
  const header = texto.split(/<STMTTRN>/i)[0]
  const bankId = extrairTag(header, 'BANKID')
  const acctId = extrairTag(header, 'ACCTID')
  const mCnpj = header.match(RE_CNPJ_HEADER)
  const cnpj = mCnpj ? mCnpj[0].replace(/\D/g, '') : null
  return { bankId, acctId, cnpj }
}

/**
 * Chave estável pra identificar "de qual conta bancária este arquivo é" —
 * prioriza CNPJ (mais específico) e cai pra banco+número da conta quando
 * CNPJ não está disponível (o caso comum). Retorna null quando nem
 * BANKID+ACCTID estão presentes (arquivo atípico demais pra detectar;
 * segue o fluxo manual normal).
 */
export function fingerprintOFX(conta: OFXConta): string | null {
  if (conta.cnpj) return `cnpj:${conta.cnpj}`
  if (conta.bankId && conta.acctId) return `conta:${conta.bankId}:${conta.acctId}`
  return null
}

function proximaDataGeneral(
  frequencia: FrequenciaPagamento,
  diaMes: number,
  diasSemana: number[],
  hoje: string
): string {
  const parseHoje = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }

  if (frequencia === 'diaria') {
    const d = parseHoje(hoje)
    d.setDate(d.getDate() + 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dia}`
  }

  if (frequencia === 'semanal') {
    const appDow = (dt: Date) => (dt.getDay() + 6) % 7
    const d = parseHoje(hoje)
    const hoje_dow = appDow(d)
    const diasFixos = diasSemana.sort((a, b) => a - b)

    // próximo dia da semana
    for (const target of diasFixos) {
      const offset = target >= hoje_dow ? target - hoje_dow : 7 - hoje_dow + target
      const cand = new Date(d)
      cand.setDate(cand.getDate() + offset)
      if (offset > 0) {
        const y = cand.getFullYear()
        const m = String(cand.getMonth() + 1).padStart(2, '0')
        const dia = String(cand.getDate()).padStart(2, '0')
        return `${y}-${m}-${dia}`
      }
    }
    // fallback: próxima semana, primeiro dia
    const cand = new Date(d)
    cand.setDate(cand.getDate() + (7 - hoje_dow + diasFixos[0]))
    const y = cand.getFullYear()
    const m = String(cand.getMonth() + 1).padStart(2, '0')
    const dia = String(cand.getDate()).padStart(2, '0')
    return `${y}-${m}-${dia}`
  }

  // mensal
  const clamp = (y: number, m: number) => {
    const ultimoDia = new Date(y, m, 0).getDate()
    return Math.min(diaMes, ultimoDia)
  }
  const d = parseHoje(hoje)
  let y = d.getFullYear()
  let m = d.getMonth() + 1
  let dia = clamp(y, m)
  const cand = `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  if (cand > hoje) return cand
  m++
  if (m > 12) { m = 1; y++ }
  dia = clamp(y, m)
  return `${y}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Detecta pagamentos recorrentes: agrupa POR BENEFICIÁRIO APENAS (sem considerar valor).
 * Valores podem variar (ex: energia, água); aluguel é fixo.
 * Usa detectarPadraoRecorrencia para identificar frequência (diária, semanal, mensal).
 */
export function detectarPagamentosRecorrentes(
  transacoes: TransacaoOFX[],
  hoje: string
): PagamentoRecorrente[] {
  const saidas = transacoes.filter((t) => t.valor < 0)

  const grupos: Record<string, TransacaoOFX[]> = {}
  saidas.forEach((t) => {
    const chave = normalizarTitulo(t.nome)
    if (!grupos[chave]) grupos[chave] = []
    grupos[chave].push(t)
  })

  const resultado: PagamentoRecorrente[] = []
  Object.entries(grupos).forEach(([chave, ts]) => {
    if (ts.length < 2) return

    const datas = ts.map((t) => t.data)
    const padrao = detectarPadraoRecorrencia(datas)
    if (!padrao) return // sem padrão detectado

    // Valores: último e média
    const valores = ts.map((t) => Math.abs(t.valor))
    const valorUltimo = valores[valores.length - 1]
    const valorMedio = valores.reduce((a, b) => a + b, 0) / valores.length

    let diaMes = 1
    if (padrao.frequencia === 'mensal') {
      // dia do mês mais frequente
      const contDia: Record<number, number> = {}
      ts.forEach((t) => {
        const dia = Number(t.data.substring(8, 10))
        contDia[dia] = (contDia[dia] || 0) + 1
      })
      diaMes = Number(Object.entries(contDia).sort((a, b) => b[1] - a[1])[0][0])
    }

    resultado.push({
      chave,
      nome: ts[0].nome,
      valorUltimo,
      valorMedio,
      ocorrencias: ts.length,
      frequencia: padrao.frequencia,
      diasSemana: padrao.diasSemana,
      diaMes,
      proximaData: proximaDataGeneral(padrao.frequencia, diaMes, padrao.diasSemana, hoje),
    })
  })

  return resultado.sort((a, b) => b.ocorrencias - a.ocorrencias)
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
