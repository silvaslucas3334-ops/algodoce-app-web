import { CondicaoPagamento } from './types'

/**
 * Valida CPF (11 dígitos) ou CNPJ (14 dígitos) pelos dígitos verificadores.
 * Aceita com ou sem pontuação; retorna false para qualquer outro tamanho.
 * Validar de verdade (não só o comprimento) protege o match automático do
 * extrato: um documento digitado errado nunca casaria com o PIX real.
 */
export function validarDocumento(documento: string): boolean {
  const digitos = documento.replace(/\D/g, '')
  if (digitos.length === 11) return validarCPF(digitos)
  if (digitos.length === 14) return validarCNPJ(digitos)
  return false
}

function validarCPF(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false // 000..., 111... são inválidos
  for (const posicao of [9, 10]) {
    let soma = 0
    for (let i = 0; i < posicao; i++) {
      soma += Number(cpf[i]) * (posicao + 1 - i)
    }
    const resto = (soma * 10) % 11
    const digito = resto === 10 ? 0 : resto
    if (digito !== Number(cpf[posicao])) return false
  }
  return true
}

function validarCNPJ(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const calcular = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((acc, peso, i) => acc + Number(base[i]) * peso, 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calcular(cnpj.slice(0, 12), pesos1)
  if (d1 !== Number(cnpj[12])) return false
  const d2 = calcular(cnpj.slice(0, 13), pesos2)
  return d2 === Number(cnpj[13])
}

/** Formata para exibição: 12.345.678/0001-90 (CNPJ) ou 123.456.789-01 (CPF). */
export function formatarDocumento(documento: string): string {
  const d = documento.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return documento
}

/** Soma dias a uma data YYYY-MM-DD usando componentes locais (sem UTC drift). */
export function somarDias(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Soma meses preservando o dia (clampa para o último dia do mês se preciso). */
export function somarMeses(dataISO: string, meses: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  const alvoMes = mes - 1 + meses
  const ultimoDia = new Date(ano, alvoMes + 1, 0).getDate()
  const d = new Date(ano, alvoMes, Math.min(dia, ultimoDia))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Vencimento a partir da condição de pagamento do cadastro:
 * à vista = a própria data da compra; a prazo = data + prazo em dias (7/15/30).
 */
export function calcularVencimento(
  dataBase: string,
  condicao: CondicaoPagamento | undefined,
  prazoDias: number | undefined
): string {
  if (condicao === 'a_prazo' && prazoDias) return somarDias(dataBase, prazoDias)
  return dataBase
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Mês (ano, mes) já encerrado em relação a hoje — o Orçamento vira
 * somente leitura pra esses meses (o passado é a realidade, não se
 * reedita o plano de um mês que já fechou). O mês corrente, mesmo
 * parcialmente decorrido, e meses futuros continuam totalmente editáveis.
 */
export function mesEncerrado(ano: number, mes: number): boolean {
  const [anoAtual, mesAtual] = hojeISO().split('-').map(Number)
  return ano < anoAtual || (ano === anoAtual && mes < mesAtual)
}

/**
 * Rótulo de status para exibição: "aberto" vira Planejada ou Atrasada
 * conforme o vencimento (calculado, não persistido).
 */
export function statusExibicao(status: string, dataVencimento: string): { label: string; cor: string } {
  if (status === 'pago') return { label: 'Paga', cor: 'bg-green-100 text-green-700' }
  if (status === 'cancelado') return { label: 'Cancelada', cor: 'bg-gray-100 text-gray-500' }
  if (dataVencimento < hojeISO()) return { label: 'Atrasada', cor: 'bg-red-100 text-red-700' }
  return { label: 'Planejada', cor: 'bg-amber-100 text-amber-700' }
}
