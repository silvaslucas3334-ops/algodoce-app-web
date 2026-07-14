import { supabase } from './supabase'
import { parseOFX, TransacaoOFX } from './ofx'
import { normalizarTitulo } from './tarefas-utils'
import { FinanceiroLancamento, CandidatoConciliacao } from './types'

const RE_CNPJ = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/
const RE_CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/

/**
 * Extrai CNPJ/CPF de uma descrição de transação (PIX costuma trazer o
 * documento antes do nome no MEMO/NAME). Tenta CNPJ (14 dígitos) antes de
 * CPF (11 dígitos) por ser mais específico. Formatação de MEMO/NAME varia
 * por banco — regex é uma primeira aproximação, ajustar com extratos reais.
 */
export function extrairDocumento(texto: string): string | null {
  const mCnpj = texto.match(RE_CNPJ)
  if (mCnpj) {
    const digitos = mCnpj[0].replace(/\D/g, '')
    if (digitos.length === 14) return digitos
  }
  const mCpf = texto.match(RE_CPF)
  if (mCpf) {
    const digitos = mCpf[0].replace(/\D/g, '')
    if (digitos.length === 11) return digitos
  }
  return null
}

function chaveSintetica(t: TransacaoOFX): string {
  return `SINT-${t.data}-${t.valor}-${normalizarTitulo(t.nome)}`
}

function chaveTransacao(t: TransacaoOFX): string {
  return t.fitid || chaveSintetica(t)
}

/**
 * Importa transações de um OFX, deduplicando por FITID (ou chave sintética
 * data+valor+nome se o FITID vier ausente) dentro da mesma conta_bancaria.
 * O índice único em financeiro_extrato_transacoes é a segunda linha de
 * defesa contra corrida/reimportação simultânea.
 */
export async function importarTransacoesOFX(
  texto: string,
  contaBancaria: string,
  usuarioId: string
): Promise<{ novas: number; duplicadas: number }> {
  const transacoes = parseOFX(texto)
  if (transacoes.length === 0) return { novas: 0, duplicadas: 0 }

  const chaves = transacoes.map(chaveTransacao)
  const { data: existentes, error: erroConsulta } = await supabase
    .from('financeiro_extrato_transacoes')
    .select('fitid')
    .eq('conta_bancaria', contaBancaria)
    .in('fitid', chaves)

  if (erroConsulta) throw new Error(erroConsulta.message)

  const chavesExistentes = new Set((existentes || []).map((e) => e.fitid))
  const novas = transacoes.filter((t) => !chavesExistentes.has(chaveTransacao(t)))

  if (novas.length > 0) {
    const linhas = novas.map((t) => ({
      conta_bancaria: contaBancaria,
      fitid: chaveTransacao(t),
      data: t.data,
      valor: t.valor,
      descricao_original: t.nome,
      documento_extraido: extrairDocumento(t.nome),
      importado_por: usuarioId,
    }))
    const { error: erroInsert } = await supabase.from('financeiro_extrato_transacoes').insert(linhas)
    if (erroInsert) throw new Error(erroInsert.message)
  }

  return { novas: novas.length, duplicadas: transacoes.length - novas.length }
}

function diasEntre(dataA: string, dataB: string): number {
  const a = new Date(dataA + 'T00:00:00')
  const b = new Date(dataB + 'T00:00:00')
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000))
}

/**
 * Sugere lançamentos em aberto que podem corresponder a uma transação de
 * saída do extrato. Como a nota multi-item vira UM lançamento (valor = soma
 * dos itens), o match por valor exato cobre notas e despesas igualmente;
 * parcelas são lançamentos próprios e casam individualmente.
 * Confiança: alta (CNPJ/CPF bate) > média (vencimento ±5 dias) > baixa (só valor).
 * Nunca aplica sozinho — só retorna candidatos para o usuário confirmar.
 */
export async function sugerirCorrespondencias(
  transacaoValor: number,
  transacaoData: string,
  documentoExtraido: string | null
): Promise<CandidatoConciliacao[]> {
  if (transacaoValor >= 0) return []
  const valorAbs = Math.abs(transacaoValor)

  const { data: lancamentos, error } = await supabase
    .from('financeiro_lancamentos')
    .select('*, parte:financeiro_partes!parte_id(*), conta:financeiro_contas(codigo, nome)')
    .eq('status', 'aberto')
    .eq('valor_total', valorAbs)

  if (error) throw new Error(error.message)

  const candidatos: CandidatoConciliacao[] = (lancamentos || []).map((l: FinanceiroLancamento) => ({
    lancamento: l,
    confianca:
      documentoExtraido && l.parte?.documento === documentoExtraido
        ? 'alta'
        : diasEntre(transacaoData, l.data_vencimento) <= 5
          ? 'media'
          : 'baixa',
  }))

  const ordem = { alta: 0, media: 1, baixa: 2 }
  return candidatos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca])
}

/**
 * Confirma a conciliação: marca a transação como conciliada e o lançamento
 * como pago. Duas atualizações sequenciais (não atômicas, mesmo padrão já
 * aceito em PagamentosOFXModal) — se a segunda falhar, o erro sobe pro
 * chamador e o usuário pode tentar de novo (idempotente).
 */
export async function confirmarConciliacao(
  transacaoId: string,
  candidato: CandidatoConciliacao,
  dataPagamento: string
): Promise<void> {
  const { error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({
      status_conciliacao: 'conciliado',
      lancamento_id: candidato.lancamento.id,
      parte_id: candidato.lancamento.parte_id,
    })
    .eq('id', transacaoId)
  if (erroTransacao) throw new Error(erroTransacao.message)

  const { error: erroLancamento } = await supabase
    .from('financeiro_lancamentos')
    .update({
      status: 'pago',
      data_pagamento: dataPagamento,
      extrato_transacao_id: transacaoId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidato.lancamento.id)
  if (erroLancamento) throw new Error(erroLancamento.message)
}

/**
 * Vincula uma transação do extrato a um lançamento recém-criado (não a um
 * já existente — para isso é confirmarConciliacao). O INSERT do lançamento
 * já grava extrato_transacao_id direto, então aqui só falta marcar a
 * transação como conciliada e apontar de volta pro lançamento.
 */
export async function vincularTransacaoCriada(
  transacaoId: string,
  lancamentoId: string,
  parteId: string
): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'conciliado', lancamento_id: lancamentoId, parte_id: parteId })
    .eq('id', transacaoId)
  if (error) throw new Error(error.message)
}

export async function ignorarTransacao(transacaoId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'ignorado' })
    .eq('id', transacaoId)
  if (error) throw new Error(error.message)
}
