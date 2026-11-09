import { supabase } from './supabase'
import { EtiquetaAprovacao } from './types'
import { hojeISO } from './financeiro-utils'

// Ações em lote da tela Despesas (admin): pagar, alterar vencimento e etiquetar várias
// despesas de uma vez. Cada bloco é UM comando no banco (`update ... where id in (...)`),
// com travas no próprio comando:
//   * só mexe em lançamento que AINDA está em aberto (se alguém pagou/cancelou em outra
//     sessão, ele é ignorado em vez de sobrescrito);
//   * pagar e mudar vencimento pulam quem já tem pagamento parcial conciliado (essas só
//     se resolvem pela tela da despesa ou pela conciliação).
// Cada lançamento alterado entra no Histórico (gatilho da fase 6a).

export type AcaoLote =
  | { tipo: 'pagar'; dataPagamento: string }
  | { tipo: 'vencimento'; dataVencimento: string }
  | { tipo: 'etiqueta'; etiqueta: EtiquetaAprovacao | null }
  | { tipo: 'prevista'; dataPrevista: string | null } // null = remove a data prevista

export interface ResultadoLote {
  acao: AcaoLote['tipo']
  pedidos: number
  alterados: string[]
  /** Pedidos que não foram alterados (mudaram de status, parcial conciliado ou parou por erro). */
  ignorados: string[]
  erro: string | null
}

// Um uuid na URL do PostgREST ocupa ~37 caracteres; 100 por bloco fica bem abaixo do limite.
const TAMANHO_BLOCO = 100

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export async function aplicarLote(ids: string[], acao: AcaoLote): Promise<ResultadoLote> {
  const vazio = (erro: string): ResultadoLote => ({ acao: acao.tipo, pedidos: ids.length, alterados: [], ignorados: ids, erro })

  if (acao.tipo === 'pagar' && !DATA_ISO.test(acao.dataPagamento)) return vazio('Informe a data do pagamento.')
  if (acao.tipo === 'vencimento' && !DATA_ISO.test(acao.dataVencimento)) return vazio('Informe o novo vencimento.')
  if (acao.tipo === 'prevista' && acao.dataPrevista !== null) {
    if (!DATA_ISO.test(acao.dataPrevista)) return vazio('Informe a data prevista.')
    if (acao.dataPrevista < hojeISO()) return vazio('A data prevista não pode estar no passado.')
  }

  const agora = new Date().toISOString()
  const campos: Record<string, any> =
    acao.tipo === 'pagar'
      ? { status: 'pago', data_pagamento: acao.dataPagamento, updated_at: agora }
      : acao.tipo === 'vencimento'
        ? { data_vencimento: acao.dataVencimento, updated_at: agora }
        : acao.tipo === 'prevista'
          ? { data_prevista_pagamento: acao.dataPrevista, updated_at: agora }
          : { etiqueta_aprovacao: acao.etiqueta, updated_at: agora }

  const alterados: string[] = []
  let erro: string | null = null
  for (let i = 0; i < ids.length; i += TAMANHO_BLOCO) {
    const bloco = ids.slice(i, i + TAMANHO_BLOCO)
    let consulta = supabase.from('financeiro_lancamentos').update(campos).in('id', bloco).eq('status', 'aberto')
    // etiqueta e data prevista valem também para quem já pagou parte (planeja o que falta)
    if (acao.tipo === 'pagar' || acao.tipo === 'vencimento') {
      consulta = consulta.or('valor_pago_conciliado.is.null,valor_pago_conciliado.eq.0')
    }
    const { data, error } = await consulta.select('id')
    if (error) {
      erro = error.message
      break
    }
    alterados.push(...((data || []) as { id: string }[]).map((x) => x.id))
  }

  const feitos = new Set(alterados)
  return { acao: acao.tipo, pedidos: ids.length, alterados, ignorados: ids.filter((id) => !feitos.has(id)), erro }
}

/** Frase do resultado, pronta para o aviso da tela. */
export function descreverResultadoLote(r: ResultadoLote): { texto: string; ok: boolean } {
  const [singular, plural] =
    r.acao === 'pagar'
      ? ['paga', 'pagas']
      : r.acao === 'vencimento'
        ? ['com vencimento alterado', 'com vencimento alterado']
        : r.acao === 'prevista'
          ? ['com pagamento previsto atualizado', 'com pagamento previsto atualizado']
          : ['com etiqueta atualizada', 'com etiqueta atualizada']
  const feitas = r.alterados.length
  const verbo = feitas === 1 ? singular : plural
  if (r.erro) {
    return {
      ok: false,
      texto: `Parou por erro: ${r.erro}. ${feitas} ${feitas === 1 ? 'despesa ficou' : 'despesas ficaram'} ${verbo} antes disso; ${r.ignorados.length} não foram alteradas.`,
    }
  }
  const base = `${feitas} ${feitas === 1 ? 'despesa' : 'despesas'} ${verbo}`
  if (r.ignorados.length === 0) return { ok: true, texto: `${base}.` }
  const uma = r.ignorados.length === 1
  const motivo =
    r.acao === 'etiqueta' || r.acao === 'prevista'
      ? uma ? 'ela já não estava em aberto' : 'elas já não estavam em aberto'
      : uma
        ? 'ela já não estava em aberto ou tem pagamento parcial conciliado'
        : 'elas já não estavam em aberto ou têm pagamento parcial conciliado'
  return { ok: false, texto: `${base}. ${r.ignorados.length} ${uma ? 'foi ignorada' : 'foram ignoradas'}: ${motivo}.` }
}
