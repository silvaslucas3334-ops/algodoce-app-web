import { supabase } from './supabase'
import { parseOFX, TransacaoOFX } from './ofx'
import { normalizarTitulo } from './tarefas-utils'
import {
  FinanceiroCompraInsumo,
  FinanceiroDespesa,
  CandidatoConciliacao,
} from './types'

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

// Valores vêm de NUMERIC do Postgres serializado como número JS — comparação
// com tolerância de meio centavo evita falso-negativo de ponto flutuante.
function valoresIguais(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

function calcularConfianca(
  documentoParte: string | undefined,
  documentoExtraido: string | null,
  dataTransacao: string,
  dataReferencia: string
): 'alta' | 'media' | 'baixa' {
  if (documentoExtraido && documentoParte && documentoParte === documentoExtraido) return 'alta'
  if (diasEntre(dataTransacao, dataReferencia) <= 5) return 'media'
  return 'baixa'
}

/**
 * Sugere despesas/compras em aberto que podem corresponder a uma transação
 * de saída do extrato. Considera:
 *  - despesas gerais com valor exato;
 *  - compras de insumo com valor exato (NF de item único);
 *  - GRUPOS de compras da mesma NF/fornecedor cuja SOMA bate com o valor
 *    (NF multi-item paga num boleto só — caso comum: nota com vários insumos).
 * Confiança: alta (CNPJ/CPF bate) > média (data ±5 dias) > baixa (só valor).
 * Nunca aplica sozinho — só retorna candidatos para o usuário confirmar.
 */
export async function sugerirCorrespondencias(
  transacaoValor: number,
  transacaoData: string,
  documentoExtraido: string | null
): Promise<CandidatoConciliacao[]> {
  if (transacaoValor >= 0) return []
  const valorAbs = Math.abs(transacaoValor)

  // Todas as compras em aberto (não só as de valor exato): precisamos delas
  // para montar os grupos por NF. Volume esperado é pequeno (contas a pagar
  // em aberto), então filtrar/agrupar no cliente é ok.
  const [{ data: compras, error: erroCompras }, { data: despesas, error: erroDespesas }] = await Promise.all([
    supabase
      .from('financeiro_compras_insumos')
      .select('*, fornecedor:financeiro_partes!fornecedor_id(*), materia_prima:financeiro_materias_primas(*)')
      .eq('status', 'aberto'),
    supabase
      .from('financeiro_despesas')
      .select('*, parte:financeiro_partes!parte_id(*)')
      .eq('status', 'aberto')
      .eq('valor', valorAbs),
  ])

  if (erroCompras) throw new Error(erroCompras.message)
  if (erroDespesas) throw new Error(erroDespesas.message)

  const candidatos: CandidatoConciliacao[] = []

  // 1) Compras individuais com valor exato
  const comprasExatas = (compras || []).filter((c: FinanceiroCompraInsumo) => valoresIguais(c.valor_total, valorAbs))
  comprasExatas.forEach((c: FinanceiroCompraInsumo) => {
    candidatos.push({
      tipo: 'compra_insumo',
      registros: [c],
      confianca: calcularConfianca(c.fornecedor?.documento, documentoExtraido, transacaoData, c.data_compra),
    })
  })

  // 2) Grupos por NF: mesma nota + mesmo fornecedor, 2+ itens, soma exata.
  //    Linhas que já bateram sozinhas (caso 1) não formam grupo consigo mesmas.
  const idsExatos = new Set(comprasExatas.map((c: FinanceiroCompraInsumo) => c.id))
  const grupos = new Map<string, FinanceiroCompraInsumo[]>()
  ;(compras || []).forEach((c: FinanceiroCompraInsumo) => {
    if (!c.numero_nota_fiscal || idsExatos.has(c.id)) return
    const chave = `${c.fornecedor_id}|${c.numero_nota_fiscal}`
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push(c)
  })
  grupos.forEach((linhas) => {
    if (linhas.length < 2) return
    const soma = linhas.reduce((acc, l) => acc + l.valor_total, 0)
    if (!valoresIguais(soma, valorAbs)) return
    const primeira = linhas[0]
    candidatos.push({
      tipo: 'compra_insumo',
      registros: linhas,
      numero_nota_fiscal: primeira.numero_nota_fiscal || undefined,
      confianca: calcularConfianca(
        primeira.fornecedor?.documento,
        documentoExtraido,
        transacaoData,
        primeira.data_compra
      ),
    })
  })

  // 3) Despesas gerais com valor exato
  ;(despesas || []).forEach((d: FinanceiroDespesa) => {
    candidatos.push({
      tipo: 'despesa_geral',
      registros: [d],
      confianca: calcularConfianca(d.parte?.documento, documentoExtraido, transacaoData, d.data_vencimento),
    })
  })

  const ordem = { alta: 0, media: 1, baixa: 2 }
  return candidatos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca])
}

/**
 * Confirma a conciliação: marca a transação como conciliada e todos os
 * registros do candidato (1 despesa/compra, ou todas as linhas de uma NF
 * multi-item) como pagos. Atualizações sequenciais (não atômicas, mesmo
 * padrão já aceito em PagamentosOFXModal) — se alguma falhar, o erro sobe
 * pro chamador e o usuário pode tentar de novo (idempotente).
 */
export async function confirmarConciliacao(
  transacaoId: string,
  candidato: CandidatoConciliacao,
  dataPagamento: string
): Promise<void> {
  const primeiro = candidato.registros[0]
  const parteId = candidato.tipo === 'compra_insumo'
    ? (primeiro as FinanceiroCompraInsumo).fornecedor_id
    : (primeiro as FinanceiroDespesa).parte_id

  // Grupo de NF (várias linhas): o vínculo direto na transação fica nulo —
  // a ligação passa a ser o extrato_transacao_id gravado em cada linha.
  const unico = candidato.registros.length === 1 ? primeiro.id : null

  const { error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({
      status_conciliacao: 'conciliado',
      tipo_match: candidato.tipo,
      compra_insumo_id: candidato.tipo === 'compra_insumo' ? unico : null,
      despesa_id: candidato.tipo === 'despesa_geral' ? unico : null,
      parte_id: parteId,
    })
    .eq('id', transacaoId)
  if (erroTransacao) throw new Error(erroTransacao.message)

  const tabela = candidato.tipo === 'compra_insumo' ? 'financeiro_compras_insumos' : 'financeiro_despesas'
  const ids = candidato.registros.map((r) => r.id)
  const { error: erroRegistros } = await supabase
    .from(tabela)
    .update({
      status: 'pago',
      data_pagamento: dataPagamento,
      extrato_transacao_id: transacaoId,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids)
  if (erroRegistros) throw new Error(erroRegistros.message)
}

export async function ignorarTransacao(transacaoId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'ignorado' })
    .eq('id', transacaoId)
  if (error) throw new Error(error.message)
}
