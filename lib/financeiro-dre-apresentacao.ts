import type { DreResultado, DreSecao } from './financeiro-dre'

// Lógica de APRESENTAÇÃO do DRE (tela de desktop): monta as linhas da cascata, as variações contra o mês anterior
// e os passos do gráfico "da receita ao resultado". Não calcula nada novo do DRE — só reorganiza o que
// buscarDre já devolve, então o resultado exibido é sempre o mesmo número do cálculo.

export type TipoLinha = 'receita' | 'grupo' | 'subtotal' | 'resultado'
/** ganho: subir é bom (receita, lucro). custo: subir é ruim (deduções, CMV, despesas). */
export type SentidoLinha = 'ganho' | 'custo'

export interface ContaCascata {
  contaId: string
  codigo: string
  nome: string
  valor: number
  /** valor da mesma conta no mês anterior (null = sem mês anterior para comparar) */
  anterior: number | null
  nota?: string
}

export interface LinhaCascata {
  id: string
  tipo: TipoLinha
  rotulo: string
  valor: number
  anterior: number | null
  sentido: SentidoLinha
  secao?: DreSecao
  contas: ContaCascata[]
  /** linha que precisa de atenção (ex.: "Não classificado") */
  alerta?: boolean
}

export type TomVariacao = 'bom' | 'ruim' | 'neutro' | 'nenhum'
export interface Variacao {
  texto: string
  tom: TomVariacao
}

const fmtNum = (n: number, casas: number) => n.toFixed(casas).replace('.', ',')

/** "R$ 5,1 mil" / "R$ 850" — só para variações e rótulos do gráfico; a tabela usa o valor cheio. */
export function compactoBRL(n: number): string {
  const abs = Math.abs(n)
  const sinal = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sinal}R$ ${fmtNum(abs / 1_000_000, 2)} mi`
  if (abs >= 1000) return `${sinal}R$ ${fmtNum(abs / 1000, 1)} mil`
  return `${sinal}R$ ${Math.round(abs)}`
}

/**
 * Variação contra o mês anterior.
 * - 'percentual' (receita, grupos de custo): +9% / −8%; mês anterior zerado vira "novo" ou "—".
 * - 'absoluto' (resultados, que podem cruzar o zero e tornam o % enganoso): diferença em R$.
 * `sentido` decide a cor: custo que sobe é ruim; ganho que sobe é bom.
 */
export function calcularVariacao(
  valor: number,
  anterior: number | null,
  modo: 'percentual' | 'absoluto',
  sentido: SentidoLinha
): Variacao {
  if (anterior === null) return { texto: '—', tom: 'nenhum' }
  const diff = valor - anterior
  if (Math.abs(diff) < 0.005) return { texto: modo === 'percentual' ? '0%' : '=', tom: 'neutro' }
  const subiu = diff > 0
  const bom = sentido === 'ganho' ? subiu : !subiu
  if (modo === 'absoluto') {
    return { texto: `${subiu ? '+' : '−'}${compactoBRL(Math.abs(diff))}`, tom: bom ? 'bom' : 'ruim' }
  }
  if (anterior === 0) return { texto: 'novo', tom: 'neutro' }
  const pct = (diff / Math.abs(anterior)) * 100
  if (Math.abs(pct) < 0.5) return { texto: '0%', tom: 'neutro' }
  const texto = `${pct > 0 ? '+' : '−'}${Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : fmtNum(Math.abs(pct), 0)}%`
  return { texto, tom: bom ? 'bom' : 'ruim' }
}

function contasDa(secao: DreSecao, anterior: DreSecao | null): ContaCascata[] {
  const antes = new Map((anterior?.contas || []).map((c) => [c.contaId, c.valor]))
  return secao.contas.map((c) => ({
    contaId: c.contaId,
    codigo: c.codigo,
    nome: c.nome,
    valor: c.valor,
    // conta que não existia no mês anterior conta como 0 (há mês anterior para comparar), não como "sem dado"
    anterior: anterior ? (antes.get(c.contaId) ?? 0) : null,
    nota: c.notaZerado,
  }))
}

/** Só compara com o mês anterior se ele tem dados (mês sem receita nem lançamentos não é referência). */
function referencia(ant: DreResultado | null): DreResultado | null {
  return ant && ant.temDados ? ant : null
}

export function montarCascata(d: DreResultado, antes: DreResultado | null): LinhaCascata[] {
  const a = referencia(antes)
  const grupo = (id: string, rotulo: string, secao: DreSecao, anteriorSecao: DreSecao | null, alerta = false): LinhaCascata => ({
    id,
    tipo: 'grupo',
    rotulo,
    valor: secao.total,
    anterior: anteriorSecao ? anteriorSecao.total : null,
    sentido: 'custo',
    secao,
    contas: contasDa(secao, anteriorSecao),
    alerta,
  })
  const total = (id: string, rotulo: string, valor: number, anterior: number | null, tipo: 'receita' | 'subtotal' | 'resultado'): LinhaCascata => ({
    id,
    tipo,
    rotulo,
    valor,
    anterior,
    sentido: 'ganho',
    contas: [],
  })

  const linhas: LinhaCascata[] = [
    total('receita-bruta', 'Receita bruta de vendas', d.totalReceitaBruta, a ? a.totalReceitaBruta : null, 'receita'),
    grupo('deducoes', '(−) Deduções de vendas', d.secaoDeducaoVendas, a ? a.secaoDeducaoVendas : null),
    total('receita-liquida', '= Receita líquida de vendas', d.totalReceitaLiquida, a ? a.totalReceitaLiquida : null, 'subtotal'),
    grupo('cmv', '(−) CMV · compras de insumos', d.secaoCmv, a ? a.secaoCmv : null),
    grupo('mao-obra', '(−) Mão de obra e encargos', d.secaoMaoObra, a ? a.secaoMaoObra : null),
    total('lucro-bruto', '= Lucro bruto', d.totalLucroBruto, a ? a.totalLucroBruto : null, 'subtotal'),
    grupo('despesas-operacionais', '(−) Despesas operacionais', d.secaoDespesasOperacionais, a ? a.secaoDespesasOperacionais : null),
  ]
  if (d.secaoNaoClassificada.total !== 0) {
    linhas.push(grupo('nao-classificado', 'Não classificado (revisar plano de contas)', d.secaoNaoClassificada, a ? a.secaoNaoClassificada : null, true))
  }
  linhas.push(
    total('resultado-operacional', '= Resultado operacional', d.totalResultadoOperacional, a ? a.totalResultadoOperacional : null, 'resultado'),
    grupo('resultado-financeiro', '(−) Resultado financeiro', d.secaoResultadoFinanceiro, a ? a.secaoResultadoFinanceiro : null),
    total(
      'lucro-antes-distribuicao',
      '= Lucro líquido antes da distribuição',
      d.totalLucroLiquidoAntesDistribuicao,
      a ? a.totalLucroLiquidoAntesDistribuicao : null,
      'resultado'
    ),
    grupo('distribuicao', '(−) Distribuição de lucros', d.secaoDistribuicaoLucros, a ? a.secaoDistribuicaoLucros : null),
    total('resultado', '= Resultado líquido do período', d.resultado, a ? a.resultado : null, 'resultado')
  )
  return linhas
}

export function variacaoDaLinha(l: LinhaCascata): Variacao {
  return calcularVariacao(l.valor, l.anterior, l.tipo === 'resultado' ? 'absoluto' : 'percentual', l.sentido)
}

export function variacaoDaConta(c: ContaCascata): Variacao {
  return calcularVariacao(c.valor, c.anterior, 'percentual', 'custo')
}

/** Percentual sobre a receita líquida (denominador único da tabela); null quando não há receita líquida. */
export function percentualDaReceitaLiquida(valor: number, receitaLiquida: number): number | null {
  return receitaLiquida > 0 ? (valor / receitaLiquida) * 100 : null
}

export interface PassoGrafico {
  rotulo: string
  de: number
  ate: number
  valor: number
  tipo: 'total' | 'queda' | 'resultado'
}

/** Passos do gráfico "da receita bruta ao resultado". Passos zerados saem (menos receita e resultado). */
export function passosDoGrafico(d: DreResultado): PassoGrafico[] {
  const passos: PassoGrafico[] = [{ rotulo: 'Receita', de: 0, ate: d.totalReceitaBruta, valor: d.totalReceitaBruta, tipo: 'total' }]
  let corrente = d.totalReceitaBruta
  const queda = (rotulo: string, valor: number) => {
    if (Math.abs(valor) < 0.005) return
    passos.push({ rotulo, de: corrente, ate: corrente - valor, valor, tipo: 'queda' })
    corrente -= valor
  }
  queda('Deduções', d.secaoDeducaoVendas.total)
  queda('CMV', d.secaoCmv.total)
  queda('Mão de obra', d.secaoMaoObra.total)
  // "Não classificado" faz parte do resultado operacional (ver buscarDre): entra junto das despesas
  queda('Despesas', d.secaoDespesasOperacionais.total + d.secaoNaoClassificada.total)
  queda('Financeiro', d.secaoResultadoFinanceiro.total)
  queda('Distribuição', d.secaoDistribuicaoLucros.total)
  passos.push({ rotulo: 'Resultado', de: 0, ate: d.resultado, valor: d.resultado, tipo: 'resultado' })
  return passos
}
