import { supabase } from './supabase'
import { PDV_STATUS_RECEITA } from './constants'
import { hojeISO } from './financeiro-utils'
import type { DreResultado, VisaoDre } from './financeiro-dre'

// Fase 1 da repaginação do DRE — "DRE completo?". O resultado do mês só merece confiança se os dados que o
// alimentam estão completos: o dono precisa VER o que falta, em vez de ler um número parcial como se fosse final.
// Cada verificação devolve um item com nível (alerta/atenção), detalhe e, quando há, o atalho para resolver.

export type NivelQualidade = 'alerta' | 'atencao'

export interface ItemQualidade {
  id: string
  nivel: NivelQualidade
  titulo: string
  detalhe: string
  href?: string
  hrefRotulo?: string
}

export interface QualidadeDre {
  /** mês corrente (parcial) ou futuro; null = mês já encerrado */
  mesEmAndamento: { dia: number; total: number; futuro: boolean } | null
  itens: ItemQualidade[]
  /** true quando não há nenhum alerta (itens de atenção não impedem) */
  completo: boolean
}

const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pad = (n: number) => String(n).padStart(2, '0')
const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function lojasDaVisao(unidade: VisaoDre): ('loja1' | 'loja2')[] {
  return unidade === 'consolidado' ? ['loja1', 'loja2'] : [unidade]
}

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    todos.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return todos
}

/** Valor de uma conta (pelo código) dentro da seção de deduções já calculada. */
function valorDaConta(dre: DreResultado, codigo: string): number {
  return dre.secaoDeducaoVendas.contas.find((c) => c.codigo === codigo)?.valor || 0
}

export async function buscarQualidadeDre(unidade: VisaoDre, ano: number, mes: number, dre: DreResultado): Promise<QualidadeDre> {
  const hoje = hojeISO()
  const inicio = `${ano}-${pad(mes)}-01`
  const ultimo = new Date(ano, mes, 0).getDate()
  const fim = `${ano}-${pad(mes)}-${pad(ultimo)}`
  const lojas = lojasDaVisao(unidade)
  const itens: ItemQualidade[] = []

  // --- mês em andamento -------------------------------------------------------------------------------
  let mesEmAndamento: QualidadeDre['mesEmAndamento'] = null
  if (inicio > hoje) mesEmAndamento = { dia: 0, total: ultimo, futuro: true }
  else if (fim >= hoje) mesEmAndamento = { dia: Number(hoje.slice(8, 10)), total: ultimo, futuro: false }

  // --- encargos de venda não lançados (contas 2003/2004 e 2005) --------------------------------------------
  // A receita bruta é o faturamento; cartão e aplicativo depositam o LÍQUIDO. Sem a taxa lançada (despesa
  // não-caixa) o DRE mostra receita e margem maiores do que a realidade.
  // Cada conta é conferida separadamente (uma lançada não esconde o alerta das outras). O atalho já abre a nova
  // despesa com a conta, a data (último dia do mês, ou hoje se o mês não acabou) e a unidade preenchidas.
  if (dre.totalReceitaBruta > 0) {
    const dataLancamento = fim < hoje ? fim : hoje
    const nivelEncargo: NivelQualidade = mesEmAndamento ? 'atencao' : 'alerta'
    const sufixoParcial = mesEmAndamento ? ' O mês ainda está em andamento: lance quando o valor do mês fechar.' : ''
    const atalho = (codigo: string, descricao: string) => {
      const p = new URLSearchParams({ conta: codigo, dataLancamento, descricao })
      if (unidade !== 'consolidado') p.set('unidade', unidade)
      return `/financeiro/despesas/nova?${p.toString()}`
    }
    const rotuloMes = `${pad(mes)}/${ano}`
    const encargos: { codigo: string; id: string; titulo: string; detalhe: string; descricao: string }[] = [
      {
        codigo: '2003',
        id: 'taxa-aplicativo',
        titulo: 'Comissão de aplicativo (conta 2003) não lançada',
        detalhe:
          'iFood e Aiqfome repassam o valor líquido. Lance a comissão do mês como despesa não-caixa, pelo valor que consta no extrato/relatório do aplicativo.' + sufixoParcial,
        descricao: `Comissão de aplicativo ${rotuloMes}`,
      },
      {
        codigo: '2004',
        id: 'taxa-cartoes',
        titulo: 'Taxa de cartões (conta 2004) não lançada',
        detalhe:
          'Maquininha: débito, crédito e antecipação. O adquirente deposita o valor líquido; lance a diferença do mês como despesa não-caixa.' + sufixoParcial,
        descricao: `Taxa de cartões ${rotuloMes}`,
      },
      {
        codigo: '2005',
        id: 'impostos',
        titulo: 'Impostos sobre vendas — DAS (conta 2005) não lançados',
        detalhe:
          'No Simples Nacional o DAS incide sobre a receita (não sobre o lucro) e entra no DRE do mês da receita, mesmo sem a guia paga — confirme o valor com o contador.' + sufixoParcial,
        descricao: `DAS ${rotuloMes}`,
      },
    ]
    for (const e of encargos) {
      if (valorDaConta(dre, e.codigo) > 0) continue
      itens.push({
        id: e.id,
        nivel: nivelEncargo,
        titulo: e.titulo,
        detalhe: e.detalhe,
        href: atalho(e.codigo, e.descricao),
        hrefRotulo: 'Lançar despesa',
      })
    }
  }

  // Consultas independentes em paralelo ------------------------------------------------------------------
  const diasRealizadosAte = fim < hoje ? fim : hoje // o dia de hoje ainda pode estar sem lançamento: só conta até ontem
  const [manuais, pedidos, extratoPendente, vencidas] = await Promise.all([
    inicio <= hoje
      ? supabase
          .from('financeiro_faturamento_diario')
          .select('unidade, data')
          .in('unidade', lojas)
          .gte('data', inicio)
          .lte('data', diasRealizadosAte)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message)
            return data || []
          })
      : Promise.resolve([] as { unidade: string; data: string }[]),
    inicio <= hoje
      ? paginar<{ unidade: string; data_periodo: string }>((de, ate) =>
          supabase
            .from('financeiro_pdv_pedidos')
            .select('unidade, data_periodo')
            .in('unidade', lojas)
            .in('status', PDV_STATUS_RECEITA)
            .gte('data_periodo', inicio)
            .lte('data_periodo', diasRealizadosAte)
            .order('id')
            .range(de, ate)
        )
      : Promise.resolve([] as { unidade: string; data_periodo: string }[]),
    paginar<{ valor: number; conta_bancaria: string }>((de, ate) =>
      supabase
        .from('financeiro_extrato_transacoes')
        .select('valor, conta_bancaria')
        .eq('status_conciliacao', 'pendente')
        .in('conta_bancaria', lojas)
        .gte('data', inicio)
        .lte('data', fim)
        .order('id')
        .range(de, ate)
    ),
    paginar<{ valor_total: number; valor_pago_conciliado: number | null; unidade: string }>((de, ate) => {
      let q = supabase
        .from('financeiro_lancamentos')
        .select('valor_total, valor_pago_conciliado, unidade')
        .in('tipo', ['despesa', 'compra_insumos'])
        .eq('status', 'aberto')
        .lt('data_vencimento', hoje)
        .gte('data_competencia', inicio)
        .lte('data_competencia', fim)
        .order('id')
        .range(de, ate)
      if (unidade !== 'consolidado') q = q.in('unidade', [unidade, 'rateio'])
      return q
    }),
  ])

  // --- dias sem faturamento ------------------------------------------------------------------------------
  if (inicio <= hoje) {
    const diasDoPeriodo: string[] = []
    for (let d = 1; d <= ultimo; d++) {
      const iso = `${ano}-${pad(mes)}-${pad(d)}`
      if (iso <= diasRealizadosAte && iso < hoje) diasDoPeriodo.push(iso)
    }
    const temDado = new Set<string>()
    manuais.forEach((m) => temDado.add(`${m.unidade}|${m.data}`))
    pedidos.forEach((p) => temDado.add(`${p.unidade}|${p.data_periodo}`))
    const faltas: string[] = []
    lojas.forEach((l) => {
      const dias = diasDoPeriodo.filter((d) => !temDado.has(`${l}|${d}`))
      if (dias.length > 0) {
        faltas.push(`${l === 'loja1' ? 'Paraisópolis' : 'Itajubá'}: ${dias.length} dia(s) (${dias.slice(0, 4).map(fmtData).join(', ')}${dias.length > 4 ? '…' : ''})`)
      }
    })
    if (faltas.length > 0) {
      itens.push({
        id: 'faturamento-dias',
        nivel: 'alerta',
        titulo: 'Dias sem lançamento de faturamento',
        detalhe: `${faltas.join(' · ')}. Dia sem lançamento conta como R$ 0,00 na receita. Se a loja fechou, registre o dia com valor zero.`,
        href: '/financeiro/fluxo-caixa',
        hrefRotulo: 'Informar faturamento do dia',
      })
    }
  }

  // --- extrato pendente ----------------------------------------------------------------------------------
  if (extratoPendente.length > 0) {
    const entradas = extratoPendente.filter((t) => Number(t.valor) > 0)
    const saidas = extratoPendente.filter((t) => Number(t.valor) < 0)
    const somaAbs = (l: { valor: number }[]) => l.reduce((s, t) => s + Math.abs(Number(t.valor)), 0)
    itens.push({
      id: 'extrato-pendente',
      nivel: extratoPendente.length > 20 ? 'alerta' : 'atencao',
      titulo: `${extratoPendente.length} transação(ões) do extrato deste mês ainda sem conciliar`,
      detalhe: `${entradas.length} entrada(s) (${fmtBRL(somaAbs(entradas))}) e ${saidas.length} saída(s) (${fmtBRL(somaAbs(saidas))}). Despesas e receitas podem estar faltando no DRE até a conciliação.`,
      href: `/financeiro/fluxo-caixa?tab=extrato&st=pendente${unidade !== 'consolidado' ? `&loja=${unidade}` : ''}`,
      hrefRotulo: 'Conciliar extrato',
    })
  }

  // --- notas com total ≠ itens -----------------------------------------------------------------------------
  if (dre.diagnostico.notasComDiferenca.n > 0) {
    itens.push({
      id: 'notas-itens',
      nivel: 'atencao',
      titulo: `${dre.diagnostico.notasComDiferenca.n} nota(s) de insumos com total diferente da soma dos itens`,
      detalhe: `Diferença líquida de ${fmtBRL(dre.diagnostico.notasComDiferenca.valor)} fora do custo do mês (o DRE conta as notas pelos itens). Confira os itens e o total das notas.`,
      href: '/financeiro/despesas',
      hrefRotulo: 'Ver despesas',
    })
  }

  // --- vencidas em aberto ----------------------------------------------------------------------------------
  if (vencidas.length > 0) {
    const total = vencidas.reduce((s, l) => s + Number(l.valor_total) - Number(l.valor_pago_conciliado || 0), 0)
    itens.push({
      id: 'vencidas',
      nivel: 'atencao',
      titulo: `${vencidas.length} lançamento(s) deste mês vencidos e ainda em aberto`,
      detalhe: `${fmtBRL(total)} em contas com competência neste mês já vencidas. Se já foram pagas, concilie ou marque como pagas; se não, o mês fecha com passivo a pagar.`,
      href: '/financeiro/despesas?status=atrasadas',
      hrefRotulo: 'Ver atrasadas',
    })
  }

  const ordem: Record<NivelQualidade, number> = { alerta: 0, atencao: 1 }
  itens.sort((a, b) => ordem[a.nivel] - ordem[b.nivel])
  return { mesEmAndamento, itens, completo: !itens.some((i) => i.nivel === 'alerta') }
}
