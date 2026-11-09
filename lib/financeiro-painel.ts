import { supabase } from './supabase'
import { hojeISO, somarDias } from './financeiro-utils'

// Painel "Contas a pagar" do Início do admin (Fase 6c). Os totais vêm de UMA função no banco
// (financeiro_painel_admin, lib/migrations/financeiro-fase6c-painel-admin.sql): só despesas/notas
// em aberto que afetam o caixa, pelo valor que ainda falta pagar.

export interface TotalPainel {
  qtd: number
  valor: number
}

export interface PainelFinanceiro {
  atrasadas: TotalPainel
  hoje: TotalPainel
  proximos7: TotalPainel
  aprovadas: TotalPainel
}

export async function buscarPainelFinanceiro(): Promise<PainelFinanceiro | null> {
  const { data, error } = await supabase.rpc('financeiro_painel_admin')
  if (error) {
    // função ainda não criada (SQL da 6c não aplicado) ou sem permissão: o painel só não aparece
    console.error('Painel financeiro indisponível:', error.message)
    return null
  }
  const l = Array.isArray(data) ? data[0] : data
  if (!l) return null
  const par = (qtd: any, valor: any): TotalPainel => ({ qtd: Number(qtd) || 0, valor: Number(valor) || 0 })
  return {
    atrasadas: par(l.atrasadas_qtd, l.atrasadas_valor),
    hoje: par(l.hoje_qtd, l.hoje_valor),
    proximos7: par(l.prox7_qtd, l.prox7_valor),
    aprovadas: par(l.aprovadas_qtd, l.aprovadas_valor),
  }
}

/** Links da lista de Despesas que reproduzem exatamente cada número do painel. */
export function linksPainelFinanceiro() {
  const hoje = hojeISO()
  const amanha = somarDias(hoje, 1)
  const em7 = somarDias(hoje, 7)
  return {
    atrasadas: '/financeiro/despesas?status=atrasadas',
    hoje: `/financeiro/despesas?status=aberto&de=${hoje}&ate=${hoje}`,
    proximos7: `/financeiro/despesas?status=aberto&de=${amanha}&ate=${em7}`,
    aprovadas: '/financeiro/despesas?status=aberto&etq=aprovada_pagamento',
  }
}
