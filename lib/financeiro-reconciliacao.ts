import { supabase } from './supabase'
import { parseOFX, TransacaoOFX } from './ofx'
import { normalizarTitulo } from './tarefas-utils'
import { FinanceiroLancamento, CandidatoConciliacao, UnidadeFinanceiro } from './types'
import { AjusteConciliacao, anexarObservacao, arredondar2, montarObservacaoAjuste } from './conciliacao-diferenca'

// O builder do Supabase é "thenable" (PromiseLike), não uma Promise de verdade.
type Desfazer = () => PromiseLike<unknown>

/** Roda os "desfazer" em ordem inversa, engolindo erros (melhor esforço) — usado quando um passo de uma conciliação falha no meio. */
async function reverterPassos(passos: Desfazer[]): Promise<void> {
  for (const desfazer of passos.slice().reverse()) {
    try {
      await desfazer()
    } catch (e) {
      console.error('Falha ao reverter passo da conciliação:', e)
    }
  }
}

/**
 * Grava, na própria despesa, o ajuste escolhido na conciliação (alterar o valor para o valor pago, ou
 * registrar a diferença como juros/taxa) e anota o motivo em `observacoes`. A mudança de valor também
 * entra na trilha de auditoria do lançamento (gatilho da Fase 6a). Devolve o "desfazer" do ajuste, para
 * o chamador reverter se um passo seguinte da conciliação falhar.
 */
async function aplicarAjusteLancamento(ajuste: AjusteConciliacao, dataISO: string): Promise<Desfazer> {
  if (ajuste.tipo === 'juros_taxa' && !(ajuste.delta > 0)) {
    throw new Error('Juros/taxa só se aplica quando o banco pagou a mais que a despesa.')
  }
  const { data: atual, error: erroBusca } = await supabase
    .from('financeiro_lancamentos')
    .select('valor_total, valor_juros_multa, observacoes')
    .eq('id', ajuste.lancamentoId)
    .single()
  if (erroBusca) throw new Error(erroBusca.message)

  const valorAntes = Number(atual.valor_total)
  const valorDepois = arredondar2(valorAntes + ajuste.delta)
  if (!(valorDepois > 0)) throw new Error('O ajuste deixaria o valor da despesa zerado ou negativo — confira a seleção.')

  const patch: Record<string, unknown> = {
    valor_total: valorDepois,
    observacoes: anexarObservacao(
      atual.observacoes,
      montarObservacaoAjuste({ dataISO, tipo: ajuste.tipo, de: valorAntes, para: valorDepois, motivo: ajuste.motivo })
    ),
    updated_at: new Date().toISOString(),
  }
  if (ajuste.tipo === 'juros_taxa') patch.valor_juros_multa = Number(atual.valor_juros_multa || 0) + ajuste.delta

  const { data: gravado, error: erroAjuste } = await supabase
    .from('financeiro_lancamentos')
    .update(patch)
    .eq('id', ajuste.lancamentoId)
    .eq('valor_total', atual.valor_total) // se mudou enquanto o usuário conciliava, não sobrescreve
    .select('id')
  if (erroAjuste) throw new Error(erroAjuste.message)
  if (!gravado || gravado.length === 0) {
    throw new Error('A despesa foi alterada em outra sessão enquanto você conciliava — atualize a tela e tente de novo.')
  }

  return () =>
    supabase
      .from('financeiro_lancamentos')
      .update({
        valor_total: atual.valor_total,
        valor_juros_multa: atual.valor_juros_multa ?? 0,
        observacoes: atual.observacoes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ajuste.lancamentoId)
}

/** Quantas transações do extrato estão vinculadas à despesa por conciliação em grupo/parcial (tx.lancamento_id). */
export async function contarTransacoesVinculadas(lancamentoId: string): Promise<number> {
  const { count, error } = await supabase
    .from('financeiro_extrato_transacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lancamento_id', lancamentoId)
  if (error) throw new Error(error.message)
  return count || 0
}

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

export interface LoteImportacao {
  contaBancaria: string
  importadoEm: string
  total: number
  pendentes: number
  conciliados: number
  ignorados: number
}

/**
 * Agrupa transações de extrato em "lotes de importação" por
 * (conta_bancaria, importado_em) — sem coluna nova: todas as linhas de UM
 * upload (uma chamada de importarTransacoesOFX) compartilham o mesmo
 * timestamp literal do now() do Postgres, estável dentro de uma única
 * instrução INSERT. Agrupamento feito em memória — volume baixo (staging
 * de extrato bancário dos últimos meses).
 */
export async function listarImportacoesRecentes(limiteDias = 60): Promise<LoteImportacao[]> {
  const desde = new Date(Date.now() - limiteDias * 86400000).toISOString()
  const { data, error } = await supabase
    .from('financeiro_extrato_transacoes')
    .select('conta_bancaria, importado_em, status_conciliacao')
    .gte('importado_em', desde)
  if (error) throw new Error(error.message)

  const grupos = new Map<string, LoteImportacao>()
  for (const row of data || []) {
    const chave = `${row.conta_bancaria}|${row.importado_em}`
    const g = grupos.get(chave) || {
      contaBancaria: row.conta_bancaria,
      importadoEm: row.importado_em,
      total: 0,
      pendentes: 0,
      conciliados: 0,
      ignorados: 0,
    }
    g.total++
    if (row.status_conciliacao === 'pendente') g.pendentes++
    else if (row.status_conciliacao === 'conciliado') g.conciliados++
    else g.ignorados++
    grupos.set(chave, g)
  }
  return Array.from(grupos.values()).sort((a, b) => b.importadoEm.localeCompare(a.importadoEm))
}

/**
 * Reverte um lote de importação feito com a loja errada: remove só as
 * linhas ainda 'pendente' daquele (conta_bancaria, importado_em). Linhas
 * conciliadas/ignoradas do mesmo lote são preservadas (a RLS já impõe o
 * mesmo filtro; o .eq aqui garante que o número reportado ao chamador
 * reflita exatamente o que foi de fato removido).
 */
export async function reverterImportacao(contaBancaria: string, importadoEm: string): Promise<{ removidas: number }> {
  const { data, error } = await supabase
    .from('financeiro_extrato_transacoes')
    .delete()
    .eq('conta_bancaria', contaBancaria)
    .eq('importado_em', importadoEm)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (error) throw new Error(error.message)
  return { removidas: (data || []).length }
}

/**
 * Consulta o mapeamento fingerprint->loja aprendido de uma importação
 * anterior bem-sucedida (ver aprenderContaOFX) — usado pra avisar o admin
 * quando o toggle "Loja deste extrato" divergir do que já foi confirmado
 * antes pra aquela mesma conta bancária (mesmo CNPJ, ou mesmo banco+número
 * de conta quando o CNPJ não está disponível no arquivo).
 */
export async function buscarContaAprendida(fingerprint: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('financeiro_ofx_contas_conhecidas')
    .select('conta_bancaria')
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.conta_bancaria ?? null
}

/**
 * Aprende/atualiza (upsert) o mapeamento fingerprint->loja depois de uma
 * importação bem-sucedida — inclusive quando o admin confirma manualmente
 * por cima de um aviso de divergência, o que também autocorrige um
 * mapeamento anterior errado. Best-effort: erro aqui nunca deve derrubar a
 * importação já concluída (ver chamador em ConciliarExtratoTab.tsx).
 */
export async function aprenderContaOFX(
  fingerprint: string,
  contaBancaria: string,
  usuarioId: string,
  info: { bankId: string | null; acctId: string | null; cnpj: string | null }
): Promise<void> {
  const { error } = await supabase.from('financeiro_ofx_contas_conhecidas').upsert(
    {
      fingerprint,
      conta_bancaria: contaBancaria,
      bank_id: info.bankId,
      acct_id: info.acctId,
      cnpj: info.cnpj,
      aprendido_por: usuarioId,
    },
    { onConflict: 'fingerprint' }
  )
  if (error) throw new Error(error.message)
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
  // Despesa já paga: o que importa é quão perto o pagamento registrado está do débito do banco (o
  // vencimento antigo de uma compra já paga não diz nada sobre este débito).
  const dataReferencia =
    lancamento.status === 'pago' && lancamento.data_pagamento ? lancamento.data_pagamento : lancamento.data_vencimento
  return diasEntre(transacaoData, dataReferencia) <= 5 ? 'media' : 'baixa'
}

function ordenarPorConfianca(candidatos: CandidatoConciliacao[]): CandidatoConciliacao[] {
  const ordem = { alta: 0, media: 1, baixa: 2 }
  return candidatos.sort((a, b) => ordem[a.confianca] - ordem[b.confianca])
}

/**
 * Sugere lançamentos que podem corresponder a uma transação de saída do
 * extrato — em aberto (fluxo normal, confirmar marca como pago) OU já
 * pagos sem vínculo de extrato ainda (alguém já registrou o pagamento por
 * outro caminho; confirmar só vincula, não reaplica "marcar como pago" —
 * ver confirmarConciliacaoJaPago). Um lançamento pago já vinculado a OUTRA
 * transação nunca entra aqui (evita vínculo duplicado; a coluna também tem
 * índice único parcial garantindo isso no banco).
 * Como a nota multi-item vira UM lançamento (valor = soma dos itens), o
 * match por valor exato cobre notas e despesas igualmente; parcelas são
 * lançamentos próprios e casam individualmente.
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
    .in('status', ['aberto', 'pago'])
    .is('extrato_transacao_id', null)
    .eq('valor_total', valorAbs)

  if (error) throw new Error(error.message)

  const candidatos: CandidatoConciliacao[] = (lancamentos || []).map((l: FinanceiroLancamento) => ({
    lancamento: l,
    confianca: classificarConfianca(transacaoData, documentoExtraido, l),
    jaPago: l.status === 'pago',
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
 * Também casa despesas já pagas por outro caminho (ex: fornecedor com
 * várias entregas, cada uma paga na hora, mas o banco só registra o
 * extrato depois) — mesmo espírito de sugerirCorrespondencias, que já
 * inclui 'pago' no match único.
 */
export async function sugerirCorrespondenciasPorSoma(
  somaAbs: number,
  dataReferencia: string
): Promise<CandidatoConciliacao[]> {
  const { data: lancamentos, error } = await supabase
    .from('financeiro_lancamentos')
    .select('*, parte:financeiro_partes!parte_id(*), conta:financeiro_contas(codigo, nome)')
    .in('status', ['aberto', 'pago'])
    .is('extrato_transacao_id', null)
    .gte('valor_total', somaAbs - TOLERANCIA_JUROS)
    .lte('valor_total', somaAbs + TOLERANCIA_JUROS)

  if (error) throw new Error(error.message)

  const candidatos: CandidatoConciliacao[] = (lancamentos || []).map((l: FinanceiroLancamento) => ({
    lancamento: l,
    confianca: classificarConfianca(dataReferencia, null, l),
    jaPago: l.status === 'pago',
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
 * como pago. Duas atualizações sequenciais (não atômicas). Cada uma tem
 * guarda de estado e conferência de linha afetada — a transação só passa de
 * 'pendente' e o lançamento só de 'aberto' sem vínculo de extrato, então
 * duplo clique ou duas sessões não conciliam duas vezes. Se o segundo
 * passo falhar, o primeiro é desfeito (a transação volta pra fila) em vez de
 * ficar "conciliada" sem despesa e sumir dos pendentes.
 */
export async function confirmarConciliacao(
  transacaoId: string,
  candidato: CandidatoConciliacao,
  dataPagamento: string
): Promise<void> {
  const { data: transacaoAtualizada, error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({
      status_conciliacao: 'conciliado',
      lancamento_id: candidato.lancamento.id,
      parte_id: candidato.lancamento.parte_id,
    })
    .eq('id', transacaoId)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (erroTransacao) throw new Error(erroTransacao.message)
  if (!transacaoAtualizada || transacaoAtualizada.length === 0) {
    throw new Error('Esta transação já foi conciliada em outra sessão — atualize a tela.')
  }

  const desfazerTransacao = () =>
    supabase
      .from('financeiro_extrato_transacoes')
      .update({ status_conciliacao: 'pendente', lancamento_id: null, parte_id: null })
      .eq('id', transacaoId)

  const { data: lancamentoAtualizado, error: erroLancamento } = await supabase
    .from('financeiro_lancamentos')
    .update({
      status: 'pago',
      data_pagamento: dataPagamento,
      extrato_transacao_id: transacaoId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidato.lancamento.id)
    .eq('status', 'aberto')
    .is('extrato_transacao_id', null)
    .select('id')
  if (erroLancamento || !lancamentoAtualizado || lancamentoAtualizado.length === 0) {
    await reverterPassos([desfazerTransacao])
    throw new Error(
      erroLancamento?.message || 'Esta despesa já foi paga ou vinculada em outra sessão — atualize a tela e tente de novo.'
    )
  }
}

/**
 * Desfaz um match direto (1:1) de conciliação — inverso exato de
 * confirmarConciliacao: devolve a transação do extrato pra 'pendente'
 * (limpa lancamento_id/parte_id) e desvincula a despesa (limpa
 * extrato_transacao_id). Não mexe em status/data_pagamento da despesa —
 * quem chamar decide se quer reabri-la depois (o formulário de edição já
 * permite isso normalmente assim que extrato_transacao_id some).
 *
 * Não cobre o caminho de conciliação parcial (confirmarConciliacaoParcial,
 * N transações somadas contra 1 despesa) — lá não existe um
 * extrato_transacao_id único pra apontar; desfazer isso exigiria achar e
 * desvincular cada transação em financeiro_extrato_transacoes.lancamento_id
 * e reajustar valor_pago_conciliado, um fluxo diferente deste.
 */
export async function desfazerConciliacao(lancamentoId: string): Promise<void> {
  const { data: lancamento, error: erroBusca } = await supabase
    .from('financeiro_lancamentos')
    .select('extrato_transacao_id')
    .eq('id', lancamentoId)
    .single()
  if (erroBusca) throw new Error(erroBusca.message)
  if (!lancamento?.extrato_transacao_id) {
    throw new Error('Esta despesa não está vinculada a uma transação do extrato (match direto).')
  }

  const { error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'pendente', lancamento_id: null, parte_id: null })
    .eq('id', lancamento.extrato_transacao_id)
  if (erroTransacao) throw new Error(erroTransacao.message)

  const { error: erroLancamento } = await supabase
    .from('financeiro_lancamentos')
    .update({ extrato_transacao_id: null, updated_at: new Date().toISOString() })
    .eq('id', lancamentoId)
  if (erroLancamento) throw new Error(erroLancamento.message)
}

/**
 * Confirma a conciliação de um lançamento que JÁ está pago (alguém
 * registrou o pagamento por outro caminho, sem vincular a esta transação
 * do extrato) — só vincula os dois lados, nunca mexe em status/data_pagamento
 * do lançamento (já estão corretos). Espelha vincularTransacaoInterno
 * (mesmo guard por status_conciliacao='pendente' + checagem de linha
 * afetada), mas também registra o vínculo inverso no lançamento quando ele
 * ainda não tiver um (.is('extrato_transacao_id', null) como guard — nunca
 * sobrescreve um vínculo já existente).
 */
export async function confirmarConciliacaoJaPago(
  transacaoId: string,
  lancamentoId: string,
  parteId: string,
  /** Se informada, também acerta data_pagamento da despesa para a data do débito no banco (fluxo de caixa fica igual ao extrato). */
  atualizarDataPagamentoPara?: string
): Promise<void> {
  const { data, error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'conciliado', lancamento_id: lancamentoId, parte_id: parteId })
    .eq('id', transacaoId)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Transação já foi conciliada em outra sessão.')

  const patch: Record<string, unknown> = { extrato_transacao_id: transacaoId, updated_at: new Date().toISOString() }
  if (atualizarDataPagamentoPara) patch.data_pagamento = atualizarDataPagamentoPara
  const { data: vinculada, error: erroLancamento } = await supabase
    .from('financeiro_lancamentos')
    .update(patch)
    .eq('id', lancamentoId)
    .is('extrato_transacao_id', null)
    .select('id')
  if (erroLancamento || !vinculada || vinculada.length === 0) {
    // não deixa a transação "conciliada" sem despesa: volta pra fila
    await reverterPassos([
      () =>
        supabase
          .from('financeiro_extrato_transacoes')
          .update({ status_conciliacao: 'pendente', lancamento_id: null, parte_id: null })
          .eq('id', transacaoId),
    ])
    throw new Error(erroLancamento?.message || 'Esta despesa já foi vinculada a outra transação — atualize a tela e tente de novo.')
  }
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
 *
 * candidato.jaPago (lançamento pago por outro caminho, ver
 * sugerirCorrespondenciasPorSoma) só vincula as transações — nunca mexe em
 * status/data_pagamento do lançamento, que já estão corretos. Mesma regra
 * de confirmarConciliacaoJaPago, aplicada aqui pro caso de grupo.
 */
export async function confirmarConciliacaoGrupo(
  transacaoIds: string[],
  candidato: CandidatoConciliacao,
  dataPagamento: string,
  /** Diferença entre a soma dos débitos e a despesa, quando acima da tolerância: alterar o valor ou registrar como juros/taxa (com motivo). */
  ajuste?: AjusteConciliacao
): Promise<void> {
  const passos: Desfazer[] = []
  try {
    if (ajuste) passos.push(await aplicarAjusteLancamento(ajuste, dataPagamento))

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
    const idsAtualizados = (atualizadas || []).map((t: { id: string }) => t.id)
    if (idsAtualizados.length > 0) {
      passos.push(() =>
        supabase
          .from('financeiro_extrato_transacoes')
          .update({ status_conciliacao: 'pendente', lancamento_id: null, parte_id: null })
          .in('id', idsAtualizados)
      )
    }
    if (idsAtualizados.length !== transacaoIds.length) {
      throw new Error('Uma ou mais transações já foram conciliadas em outra sessão — atualize a tela e tente de novo.')
    }

    if (candidato.jaPago) return

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
  } catch (err) {
    await reverterPassos(passos)
    throw err
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
          // Competência = dia da transação no banco. Sem isto o banco usa CURRENT_DATE (o dia em que se
          // concilia, em UTC), e despesas conciliadas no mês seguinte caíam no mês errado do DRE.
          data_competencia: d.data,
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

/**
 * Busca despesas ainda sem vínculo de extrato pra montar uma conciliação
 * manual (várias despesas somando 1 transação, ou 1 despesa com diferença de
 * juros/multa). Sem filtro por texto aqui — a busca por nome/descrição é
 * feita no cliente sobre esta lista, mesmo padrão já usado em outras listas
 * do módulo (ex: Despesas). Ordena por data_lancamento (data da compra/
 * entrega), não por vencimento — é essa a data que o usuário reconhece
 * quando junta várias entregas pagas de uma vez só (vencimento pode nem
 * fazer sentido pra quem já está pago). Fornecedor do documento extraído
 * fica primeiro quando disponível, mas nunca esconde o resto.
 */
export async function buscarDespesasParaVinculoManual(
  documentoExtraido: string | null
): Promise<FinanceiroLancamento[]> {
  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .select('*, parte:financeiro_partes!parte_id(*), conta:financeiro_contas(codigo, nome)')
    .in('status', ['aberto', 'pago'])
    .is('extrato_transacao_id', null)
    // Mais recentes primeiro: com a ordem crescente + limite, o corte descartava justamente as despesas
    // mais novas (as mais prováveis). A relevância fina (fornecedor, proximidade) é aplicada na tela.
    .order('data_lancamento', { ascending: false })
    .limit(800)
  if (error) throw new Error(error.message)

  const lista = (data || []) as FinanceiroLancamento[]
  if (!documentoExtraido) return lista
  return [...lista].sort((a, b) => {
    const aMatch = a.parte?.documento === documentoExtraido ? 0 : 1
    const bMatch = b.parte?.documento === documentoExtraido ? 0 : 1
    return aMatch - bMatch
  })
}

const MAX_CANDIDATOS_COMBINACAO = 25
const MAX_ITENS_COMBINACAO = 6

/**
 * Sugere (sem aplicar) um subconjunto de candidatos cuja soma bate exato com
 * o valor alvo — busca local, força bruta com poda, limitada a poucos
 * candidatos/itens porque o caso real é "poucas entregas da mesma semana",
 * não um extrato inteiro. Só um atalho editável: o usuário sempre pode
 * marcar/desmarcar despesas na mão, sugestão nenhuma é obrigatória.
 */
export function sugerirCombinacaoDespesas(candidatos: FinanceiroLancamento[], valorAlvo: number): string[] {
  const pool = candidatos.slice(0, MAX_CANDIDATOS_COMBINACAO)
  const bater = (soma: number) => Math.abs(soma - valorAlvo) < 0.01

  for (let tamanho = 2; tamanho <= Math.min(MAX_ITENS_COMBINACAO, pool.length); tamanho++) {
    const combo = buscarCombo(pool, tamanho, valorAlvo, bater)
    if (combo) return combo.map((l) => l.id)
  }
  return []
}

// Saldo restante (valor_total menos o que já foi conciliado em débitos
// parciais anteriores), não o valor_total bruto — senão uma despesa em
// pagamento parcial entraria numa combinação ou soma pelo valor cheio, como
// se nada tivesse sido pago ainda. Exportada — reaproveitada também por
// ConciliarManualModal.tsx.
export function saldoRestante(l: FinanceiroLancamento): number {
  return l.valor_total - (l.valor_pago_conciliado || 0)
}

function buscarCombo(
  pool: FinanceiroLancamento[],
  tamanho: number,
  valorAlvo: number,
  bater: (soma: number) => boolean
): FinanceiroLancamento[] | null {
  const atual: FinanceiroLancamento[] = []
  function backtrack(inicio: number, soma: number): FinanceiroLancamento[] | null {
    if (atual.length === tamanho) return bater(soma) ? [...atual] : null
    if (soma > valorAlvo + 0.01) return null // valores são positivos — já passou do alvo, poda
    for (let i = inicio; i < pool.length; i++) {
      atual.push(pool[i])
      const achado = backtrack(i + 1, soma + saldoRestante(pool[i]))
      atual.pop()
      if (achado) return achado
    }
    return null
  }
  return backtrack(0, 0)
}

/**
 * Confirma a conciliação manual: uma transação pode ser vinculada a N
 * despesas (fornecedor com várias entregas pagas de uma vez só) ou a 1
 * despesa com ajuste de juros/multa (boleto pago com atraso). Entrada
 * alternativa a confirmarConciliacao/confirmarConciliacaoGrupo pra quando
 * não há match automático, ou quando o usuário prefere montar a combinação
 * na mão.
 *
 * financeiro_extrato_transacoes.lancamento_id (campo escalar) fica sem
 * setar aqui, mesma decisão de confirmarConciliacaoGrupo — não representa
 * bem N despesas. financeiro_lancamentos.extrato_transacao_id (sem índice
 * único desde a migration financeiro-conciliacao-manual.sql) é a fonte da
 * verdade dessa direção.
 */
export async function confirmarConciliacaoManual(
  transacaoId: string,
  lancamentoIds: string[],
  dataPagamento: string,
  /** Diferença acima da tolerância: alterar o valor da despesa ou registrar como juros/taxa (sempre com motivo). */
  ajuste?: AjusteConciliacao
): Promise<void> {
  if (lancamentoIds.length === 0) throw new Error('Selecione ao menos uma despesa.')
  if (ajuste && !lancamentoIds.includes(ajuste.lancamentoId)) {
    throw new Error('O ajuste precisa ser aplicado a uma das despesas selecionadas.')
  }

  const { data: partesLancamentos, error: erroPartes } = await supabase
    .from('financeiro_lancamentos')
    .select('parte_id')
    .in('id', lancamentoIds)
  if (erroPartes) throw new Error(erroPartes.message)
  const partesUnicas = new Set((partesLancamentos || []).map((l) => l.parte_id))

  // Cada passo registra como se desfaz; se um passo seguinte falhar, tudo que já foi gravado volta ao
  // estado anterior (antes, uma falha no meio deixava a transação "conciliada" e some da fila de pendentes).
  const passos: Desfazer[] = []
  try {
    // 1) ajuste de valor/juros primeiro: valida (valor > 0, despesa não mudou) antes de tocar no resto
    if (ajuste) passos.push(await aplicarAjusteLancamento(ajuste, dataPagamento))

    // 2) transação do extrato
    const { data: transacaoAtualizada, error: erroTransacao } = await supabase
      .from('financeiro_extrato_transacoes')
      .update({
        status_conciliacao: 'conciliado',
        parte_id: partesUnicas.size === 1 ? partesLancamentos![0].parte_id : null,
      })
      .eq('id', transacaoId)
      .eq('status_conciliacao', 'pendente')
      .select('id')
    if (erroTransacao) throw new Error(erroTransacao.message)
    if (!transacaoAtualizada || transacaoAtualizada.length === 0) {
      throw new Error('Transação já foi conciliada em outra sessão.')
    }
    passos.push(() =>
      supabase.from('financeiro_extrato_transacoes').update({ status_conciliacao: 'pendente', parte_id: null }).eq('id', transacaoId)
    )

    // 3) vínculo das despesas
    const { data: lancamentosVinculados, error: erroVinculo } = await supabase
      .from('financeiro_lancamentos')
      .update({ extrato_transacao_id: transacaoId, updated_at: new Date().toISOString() })
      .in('id', lancamentoIds)
      .is('extrato_transacao_id', null)
      .select('id, status')
    if (erroVinculo) throw new Error(erroVinculo.message)
    const idsVinculados = (lancamentosVinculados || []).map((l: { id: string }) => l.id)
    if (idsVinculados.length > 0) {
      passos.push(() =>
        supabase
          .from('financeiro_lancamentos')
          .update({ extrato_transacao_id: null, updated_at: new Date().toISOString() })
          .in('id', idsVinculados)
          .eq('extrato_transacao_id', transacaoId)
      )
    }
    if (!lancamentosVinculados || lancamentosVinculados.length !== lancamentoIds.length) {
      throw new Error('Uma ou mais despesas já foram vinculadas a outra transação — atualize a tela e tente de novo.')
    }

    // 4) despesas em aberto passam a pagas (as já pagas só ficam vinculadas, sem mexer em data/status)
    const idsParaPagar = lancamentosVinculados.filter((l: { status: string }) => l.status === 'aberto').map((l: { id: string }) => l.id)
    if (idsParaPagar.length > 0) {
      const { data: pagas, error: erroPagar } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: dataPagamento, updated_at: new Date().toISOString() })
        .in('id', idsParaPagar)
        .eq('status', 'aberto')
        .select('id')
      if (erroPagar) throw new Error(erroPagar.message)
      const idsPagos = (pagas || []).map((l: { id: string }) => l.id)
      if (idsPagos.length > 0) {
        passos.push(() =>
          supabase
            .from('financeiro_lancamentos')
            .update({ status: 'aberto', data_pagamento: null, updated_at: new Date().toISOString() })
            .in('id', idsPagos)
            .eq('status', 'pago')
        )
      }
      if (idsPagos.length !== idsParaPagar.length) {
        throw new Error('Uma ou mais despesas mudaram de status em outra sessão — atualize a tela e tente de novo.')
      }
    }
  } catch (err) {
    await reverterPassos(passos)
    throw err
  }
}

/**
 * Vincula uma transação a UMA despesa quando o banco pagou menos do que o
 * saldo restante — a despesa está sendo paga aos poucos, em mais de um
 * débito, porque a conta não tinha saldo pro valor total de uma vez.
 * status continua 'aberto' até a soma dos débitos vinculados atingir
 * valor_total; só nesse momento vira 'pago' (mesma guarda por
 * status='aberto' + conferência de linha afetada de toda função de
 * confirmação aqui). "Parcialmente paga" nunca é persistido como estado —
 * é status='aberto' com valor_pago_conciliado>0, calculado por quem exibe.
 * Ver lib/migrations/financeiro-conciliacao-parcial.sql.
 */
export async function confirmarConciliacaoParcial(
  transacaoId: string,
  lancamentoId: string,
  valorTransacao: number,
  dataPagamento: string
): Promise<{ quitado: boolean; saldoRestante: number }> {
  const { data: lancamentoAtual, error: erroLancamentoAtual } = await supabase
    .from('financeiro_lancamentos')
    .select('parte_id, valor_total, valor_pago_conciliado, status')
    .eq('id', lancamentoId)
    .single()
  if (erroLancamentoAtual) throw new Error(erroLancamentoAtual.message)
  // Guarda cedo, antes de tocar na transação do extrato: se a despesa
  // escolhida já não está mais aberta (ex: usuário clicou na parcela errada
  // entre duas com o mesmo nome, uma já paga), falha aqui em vez de marcar a
  // transação como conciliada e só depois descobrir — isso já causou um
  // vínculo órfão em produção (transação "conciliada" apontando pra uma
  // despesa já paga, sem nunca contar pro valor_pago_conciliado de ninguém).
  if (lancamentoAtual.status !== 'aberto') {
    throw new Error('Esta despesa não está mais em aberto — confira se escolheu a parcela certa e tente de novo.')
  }

  const { data: transacaoAtualizada, error: erroTransacao } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'conciliado', lancamento_id: lancamentoId, parte_id: lancamentoAtual.parte_id })
    .eq('id', transacaoId)
    .eq('status_conciliacao', 'pendente')
    .select('id')
  if (erroTransacao) throw new Error(erroTransacao.message)
  if (!transacaoAtualizada || transacaoAtualizada.length === 0) {
    throw new Error('Transação já foi conciliada em outra sessão.')
  }

  const valorTotal = Number(lancamentoAtual.valor_total)
  const novoPago = Number(lancamentoAtual.valor_pago_conciliado || 0) + Math.abs(valorTransacao)
  const saldoRestante = valorTotal - novoPago

  // Ainda existe uma janela de corrida entre o guard acima e os UPDATEs
  // abaixo (duas abas, ex.). Se o UPDATE final falhar por isso, desfaz o
  // vínculo em vez de deixar a transação presa como "conciliada" sem contar
  // pra nenhuma despesa — mesmo problema que o guard de cima evita no caso
  // comum, coberto aqui pro caso raro.
  async function desfazerVinculoTransacao() {
    await supabase
      .from('financeiro_extrato_transacoes')
      .update({ status_conciliacao: 'pendente', lancamento_id: null, parte_id: null })
      .eq('id', transacaoId)
  }

  if (saldoRestante <= 0.01) {
    const { data: quitado, error: erroQuitar } = await supabase
      .from('financeiro_lancamentos')
      .update({
        status: 'pago',
        data_pagamento: dataPagamento,
        valor_pago_conciliado: valorTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lancamentoId)
      .eq('status', 'aberto')
      .select('id')
    if (erroQuitar) {
      await desfazerVinculoTransacao()
      throw new Error(erroQuitar.message)
    }
    if (!quitado || quitado.length === 0) {
      await desfazerVinculoTransacao()
      throw new Error('Este lançamento já foi marcado como pago em outra sessão.')
    }
    return { quitado: true, saldoRestante: 0 }
  }

  const { data: atualizado, error: erroParcial } = await supabase
    .from('financeiro_lancamentos')
    .update({ valor_pago_conciliado: novoPago, updated_at: new Date().toISOString() })
    .eq('id', lancamentoId)
    .eq('status', 'aberto')
    .select('id')
  if (erroParcial) {
    await desfazerVinculoTransacao()
    throw new Error(erroParcial.message)
  }
  if (!atualizado || atualizado.length === 0) {
    await desfazerVinculoTransacao()
    throw new Error('Este lançamento mudou de status em outra sessão — atualize a tela e tente de novo.')
  }
  return { quitado: false, saldoRestante }
}

export async function ignorarTransacao(transacaoId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'ignorado' })
    .eq('id', transacaoId)
  if (error) throw new Error(error.message)
}

/**
 * Desfaz "ignorar" (status volta pra 'pendente') — só faz sentido pra uma
 * transação que está mesmo ignorada; parte_id/lancamento_id nunca chegam a
 * ser setados nesse caminho (ignorarTransacao não mexe neles), então não
 * há nada pra limpar aqui além do status.
 */
export async function reverterIgnorarTransacao(transacaoId: string): Promise<void> {
  const { error } = await supabase
    .from('financeiro_extrato_transacoes')
    .update({ status_conciliacao: 'pendente' })
    .eq('id', transacaoId)
    .eq('status_conciliacao', 'ignorado')
  if (error) throw new Error(error.message)
}
