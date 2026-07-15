import { supabase } from './supabase'
import { parseOFX, TransacaoOFX } from './ofx'
import { normalizarTitulo } from './tarefas-utils'
import { FinanceiroLancamento, CandidatoConciliacao, UnidadeFinanceiro } from './types'

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

function classificarConfianca(
  transacaoData: string,
  documentoExtraido: string | null,
  lancamento: FinanceiroLancamento
): 'alta' | 'media' | 'baixa' {
  if (documentoExtraido && lancamento.parte?.documento === documentoExtraido) return 'alta'
  return diasEntre(transacaoData, lancamento.data_vencimento) <= 5 ? 'media' : 'baixa'
}

function ordenarPorConfianca(candidatos: CandidatoConciliacao[]): CandidatoConciliacao[] {
  const ordem = { alta: 0, media: 1, baixa: 2 }
  return candidatos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca])
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
    confianca: classificarConfianca(transacaoData, documentoExtraido, l),
  }))

  return ordenarPorConfianca(candidatos)
}

// Débitos atrasados costumam vir com juros/multa/correção monetária por
// cima do valor original da parcela — não é só arredondamento de centavo.
// R$50 cobre os casos reais observados (ex: parcela de R$699 debitada a
// R$704 por 1 dia de atraso); a UI mostra a diferença de cada candidato
// pra o usuário confirmar que faz sentido antes de conciliar, já que uma
// janela desse tamanho pode por coincidência achar uma despesa não relacionada.
const TOLERANCIA_JUROS = 50

/**
 * Variante de sugerirCorrespondencias para quando o banco fragmenta o débito
 * de uma parcela (ex: contrato de empréstimo, boleto atrasado) em várias
 * transações parciais porque a conta não tinha saldo pra debitar tudo de
 * uma vez. Busca por SOMA (com tolerância de juros/correção, não só
 * centavos), não por valor exato — e nunca por CNPJ/CPF, já que essas
 * descrições de amortização não trazem documento.
 */
export async function sugerirCorrespondenciasPorSoma(
  somaAbs: number,
  dataReferencia: string
): Promise<CandidatoConciliacao[]> {
  const { data: lancamentos, error } = await supabase
    .from('financeiro_lancamentos')
    .select('*, parte:financeiro_partes!parte_id(*), conta:financeiro_contas(codigo, nome)')
    .eq('status', 'aberto')
    .gte('valor_total', somaAbs - TOLERANCIA_JUROS)
    .lte('valor_total', somaAbs + TOLERANCIA_JUROS)

  if (error) throw new Error(error.message)

  const candidatos: CandidatoConciliacao[] = (lancamentos || []).map((l: FinanceiroLancamento) => ({
    lancamento: l,
    confianca: classificarConfianca(dataReferencia, null, l),
  }))

  // Dentro de cada nível de confiança, prioriza o candidato cujo valor mais
  // se aproxima da soma — com a janela ampliada, isso evita que o primeiro
  // da lista seja um valor coincidentemente parecido mas menos plausível.
  const ordem = { alta: 0, media: 1, baixa: 2 }
  return candidatos.sort((a, b) => {
    const diffOrdem = ordem[a.confianca] - ordem[b.confianca]
    if (diffOrdem !== 0) return diffOrdem
    return Math.abs(a.lancamento.valor_total - somaAbs) - Math.abs(b.lancamento.valor_total - somaAbs)
  })
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
 * Confirma a conciliação em grupo: várias transações parciais do extrato
 * casadas contra UM lançamento cuja soma bate (ver sugerirCorrespondenciasPorSoma).
 * Diferente de confirmarConciliacao (1:1, onde reprocessar dá o mesmo
 * resultado), aqui um UPDATE cego é arriscado: duas abas poderiam casar
 * subconjuntos diferentes de transações com o mesmo lançamento aberto antes
 * de qualquer commit, corrompendo silenciosamente a invariante "soma das
 * transações vinculadas = valor_total". Por isso cada UPDATE filtra pelo
 * estado esperado (pendente/aberto) e confere quantas linhas foram
 * realmente afetadas antes de prosseguir.
 *
 * extrato_transacao_id do lançamento é deliberadamente deixado como está
 * (não setado aqui): é um campo escalar, não representa N transações. A
 * relação inversa (financeiro_extrato_transacoes.lancamento_id, que várias
 * linhas podem compartilhar) é a fonte da verdade de quais transações
 * pagaram este lançamento.
 */
export async function confirmarConciliacaoGrupo(
  transacaoIds: string[],
  candidato: CandidatoConciliacao,
  dataPagamento: string
): Promise<void> {
  const { data: atualizadas, error: erroTransacoes } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({
      status_conciliacao: 'conciliado',
      lancamento_id: candidato.lancamento.id,
      parte_id: candidato.lancamento.parte_id,
    })
    .in('id', transacaoIds)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (erroTransacoes) throw new Error(erroTransacoes.message)
  if (!atualizadas || atualizadas.length !== transacaoIds.length) {
    throw new Error('Uma ou mais transações já foram conciliadas em outra sessão — atualize a tela e tente de novo.')
  }

  const { data: lancAtualizado, error: erroLancamento } = await supabase
    .from('financeiro_lancamentos')
    .update({ status: 'pago', data_pagamento: dataPagamento, updated_at: new Date().toISOString() })
    .eq('id', candidato.lancamento.id)
    .eq('status', 'aberto')
    .select('id')
  if (erroLancamento) throw new Error(erroLancamento.message)
  if (!lancAtualizado || lancAtualizado.length === 0) {
    throw new Error('Este lançamento já foi marcado como pago em outra sessão.')
  }
}

/**
 * Marca uma transação de extrato como conciliada e aponta pro lançamento
 * que a pagou. Guarda por status_conciliacao='pendente' + conferência de
 * linha afetada — mesmo padrão defensivo de confirmarConciliacaoGrupo,
 * compartilhado por todo fluxo que vincula transação a lançamento (evita
 * duplo-processamento em duplo-clique ou duas abas).
 */
async function vincularTransacaoInterno(transacaoId: string, lancamentoId: string, parteId: string): Promise<void> {
  const { data, error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'conciliado', lancamento_id: lancamentoId, parte_id: parteId })
    .eq('id', transacaoId)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Transação já foi conciliada em outra sessão.')
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
  await vincularTransacaoInterno(transacaoId, lancamentoId, parteId)
}

export interface DespesaLoteInput {
  transacaoId: string
  valor: number
  data: string
  unidade: UnidadeFinanceiro
}

/**
 * Cria uma despesa nova por transação selecionada (não uma soma casada
 * contra UMA despesa existente — para isso é confirmarConciliacaoGrupo).
 * Cada linha é independente, sem invariante compartilhada entre elas, então
 * segue o padrão de categorizarReceitasEmLote (loop sequencial, falha de
 * um item não aborta o resto) em vez de uma RPC atômica.
 */
export async function criarDespesasEmLote(
  despesas: DespesaLoteInput[],
  parteId: string,
  contaId: string,
  descricaoBase: string,
  usuarioId: string,
  onProgress?: (concluidas: number, total: number) => void
): Promise<{ sucesso: number; falhas: { transacaoId: string; erro: string }[] }> {
  const falhas: { transacaoId: string; erro: string }[] = []
  let sucesso = 0
  for (let i = 0; i < despesas.length; i++) {
    const d = despesas[i]
    try {
      const dataFormatada = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')
      const { data: criado, error } = await supabase
        .from('financeiro_lancamentos')
        .insert({
          tipo: 'despesa',
          parte_id: parteId,
          descricao: `${descricaoBase} — ${dataFormatada}`,
          valor_total: d.valor,
          data_lancamento: d.data,
          data_vencimento: d.data,
          data_pagamento: d.data,
          status: 'pago',
          condicao_pagamento: 'a_vista',
          unidade: d.unidade,
          conta_id: contaId,
          criado_por: usuarioId,
          extrato_transacao_id: d.transacaoId,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      await vincularTransacaoInterno(d.transacaoId, criado.id, parteId)
      sucesso++
    } catch (err: any) {
      falhas.push({ transacaoId: d.transacaoId, erro: err?.message || 'desconhecido' })
    }
    onProgress?.(i + 1, despesas.length)
  }
  return { sucesso, falhas }
}

export async function ignorarTransacao(transacaoId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'ignorado' })
    .eq('id', transacaoId)
  if (error) throw new Error(error.message)
}
