import { supabase } from './supabase'
import { CategoriaReceita, FinanceiroConta, LinhaDre } from './types'
import { CATEGORIA_RECEITA_LABEL, LINHA_DRE_LABEL } from './constants'
import { buscarFaturamentoPorLojaDoMes } from './financeiro-fluxo-mensal'

export type VisaoDre = 'loja1' | 'loja2' | 'consolidado'

export interface DreLinhaDetalhe {
  parteId: string
  parteNome: string
  contaId: string
  valor: number
}

export interface DreReceitaDetalhe {
  categoria: CategoriaReceita
  data: string
  valor: number // líquido recebido, o que bateu no extrato
  valorBruto: number | null
  observacao: string | null
}

export interface DreContaValor {
  contaId: string
  codigo: string
  nome: string
  valor: number
  notaZerado?: string // preenchido só pra conta afeta_dre=false (hoje: 3002)
}

export interface DreSecao {
  linha: LinhaDre | 'nao_classificado'
  label: string
  contas: DreContaValor[]
  total: number
  // Análise vertical: % sobre Receita Líquida, exceto na própria seção de
  // Deduções de Vendas (que ainda não existe Receita Líquida pra dividir
  // por ela) — ali é % sobre Receita Bruta.
  percentual: number | null
}

export interface DreResultado {
  unidade: VisaoDre
  ano: number
  mes: number

  // Receita Bruta de Vendas = Faturamento Fiscal (Import do PDV + faturamento
  // manual do dia) — mesma fonte que já alimenta a linha "Faturamento" do
  // Fluxo de Caixa (buscarFaturamentoPorLojaDoMes). Não é mais a soma de
  // financeiro_receitas — ver entradasCaixaPorCategoria/totalEntradasCaixa
  // mais abaixo pra essa visão (informativa, regime de caixa).
  totalReceitaBruta: number

  secaoDeducaoVendas: DreSecao
  totalReceitaLiquida: number

  secaoCmv: DreSecao
  secaoMaoObra: DreSecao
  totalLucroBruto: number

  secaoDespesasOperacionais: DreSecao
  totalResultadoOperacional: number

  secaoResultadoFinanceiro: DreSecao
  totalLucroLiquidoAntesDistribuicao: number

  secaoDistribuicaoLucros: DreSecao
  resultado: number // RESULTADO LÍQUIDO DO PERÍODO

  // Contas com lançamento no período mas sem linha_dre classificada — não
  // deveria acontecer com o plano de contas seedado, mas se alguém cadastrar
  // uma conta nova sem classificar, ela cai aqui em vez de sumir do
  // resultado silenciosamente. Só aparece na tela quando tem algo dentro.
  secaoNaoClassificada: DreSecao

  // Entradas de Caixa — o que efetivamente caiu no banco (financeiro_receitas),
  // por categoria. Informativo: não alimenta mais o cálculo do resultado (ver
  // totalReceitaBruta, agora fiscal) — fica aqui pra conferência/reconciliação
  // entre o fiscal e o que realmente entrou no caixa.
  entradasCaixaPorCategoria: { categoria: CategoriaReceita; label: string; valor: number }[]
  totalEntradasCaixa: number

  percentualRateio: number | null // só preenchido quando unidade é loja1/loja2 — % do faturamento do mês que essa loja representa
  // Resgates de contas de reserva (afeta_dre=false) — informativo, fora do
  // resultado do mês: não é venda, é a própria reserva voltando pro caixa.
  totalResgatesAplicacao: number
  // Aportes lançados em contas de reserva (afeta_dre=false) — informativo,
  // fora do resultado do mês pelo mesmo motivo (não é despesa real).
  totalAportesReserva: number
  receitasDetalhadas: DreReceitaDetalhe[]
  linhasDetalhadas: DreLinhaDetalhe[] // despesas + itens de compra, por conta — alimenta o drilldown por conta
  aportesReservaDetalhados: DreLinhaDetalhe[]
}

/**
 * DRE do mês em cascata (regime de competência): Receita Bruta → Líquida →
 * Lucro Bruto → Resultado Operacional → Resultado Financeiro → Lucro
 * Líquido, seguindo a classificação linha_dre de cada conta do plano de
 * contas (ver lib/migrations/financeiro-dre-cascata.sql). Espelha
 * buscarFluxoCaixa (lib/financeiro-receitas.ts) na parte de receitas: por
 * data_competencia em vez de data_pagamento, e sem excluir despesas ainda
 * 'aberto' — só 'cancelado' fica de fora.
 *
 * Só admin acessa esta tela (mesma RLS de financeiro_receitas), então as
 * queries abaixo buscam TODAS as unidades sempre — mesmo quando a visão
 * pedida é uma loja específica — porque o cálculo do rateio precisa do
 * faturamento das duas lojas no mês, não só da que está sendo exibida.
 */
export async function buscarDre(unidade: VisaoDre, ano: number, mes: number): Promise<DreResultado> {
  const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

  const [
    { data: contasData, error: erroContas },
    { data: receitas, error: erroReceitas },
    { data: despesas, error: erroDespesas },
    { data: comprasLancamentos, error: erroCompras },
    faturamentoFiscalPorLoja,
  ] = await Promise.all([
    supabase.from('financeiro_contas').select('id, codigo, nome, linha_dre, afeta_dre'),
    supabase
      .from('financeiro_receitas')
      .select('unidade, categoria, data, valor, valor_bruto, observacao')
      .gte('data', dataInicio)
      .lte('data', dataFim),
    supabase
      .from('financeiro_lancamentos')
      .select('valor_total, unidade, parte_id, conta_id, parte:financeiro_partes!parte_id(nome)')
      .eq('tipo', 'despesa')
      .neq('status', 'cancelado')
      .gte('data_competencia', dataInicio)
      .lte('data_competencia', dataFim),
    supabase
      .from('financeiro_lancamentos')
      .select('id, unidade, parte_id, parte:financeiro_partes!parte_id(nome)')
      .eq('tipo', 'compra_insumos')
      .neq('status', 'cancelado')
      .gte('data_competencia', dataInicio)
      .lte('data_competencia', dataFim),
    buscarFaturamentoPorLojaDoMes(ano, mes),
  ])
  if (erroContas) throw new Error(erroContas.message)
  if (erroReceitas) throw new Error(erroReceitas.message)
  if (erroDespesas) throw new Error(erroDespesas.message)
  if (erroCompras) throw new Error(erroCompras.message)

  const contas = (contasData || []) as FinanceiroConta[]
  const contasPorId = new Map(contas.map((c) => [c.id, c]))

  const idsCompras = (comprasLancamentos || []).map((c: any) => c.id)
  const { data: itens, error: erroItens } =
    idsCompras.length > 0
      ? await supabase.from('financeiro_lancamento_itens').select('lancamento_id, valor_total, conta_id').in('lancamento_id', idsCompras)
      : { data: [], error: null }
  if (erroItens) throw new Error(erroItens.message)

  // Receita Bruta de Vendas = Faturamento Fiscal (mesma fonte da linha
  // "Faturamento" do Fluxo de Caixa) — soma só os dias já realizados dentro
  // do mês pedido (ignora o forecast de dias futuros, já que o DRE só olha
  // pra trás). Também vira a base do rateio entre as lojas, no lugar do
  // antigo cálculo por entrada de caixa.
  function somaRealizado(f: { porDia: (number | null)[]; ehForecastPorDia: boolean[] }): number {
    let total = 0
    f.porDia.forEach((v, i) => {
      if (!f.ehForecastPorDia[i]) total += v || 0
    })
    return total
  }
  const faturamentoFiscalLoja1 = somaRealizado(faturamentoFiscalPorLoja.find((f) => f.loja === 'loja1')!)
  const faturamentoFiscalLoja2 = somaRealizado(faturamentoFiscalPorLoja.find((f) => f.loja === 'loja2')!)
  const totalReceitaBruta =
    unidade === 'consolidado'
      ? faturamentoFiscalLoja1 + faturamentoFiscalLoja2
      : unidade === 'loja1'
        ? faturamentoFiscalLoja1
        : faturamentoFiscalLoja2

  const percentualRateio =
    unidade === 'consolidado'
      ? null
      : (() => {
          const total = faturamentoFiscalLoja1 + faturamentoFiscalLoja2
          const receitaUnidade = unidade === 'loja1' ? faturamentoFiscalLoja1 : faturamentoFiscalLoja2
          return total > 0 ? receitaUnidade / total : 0
        })()

  // Entradas de Caixa — o que efetivamente caiu no banco (financeiro_receitas),
  // por categoria. Não alimenta mais o resultado (ver totalReceitaBruta acima,
  // agora fiscal) — fica como bloco informativo/conferência na tela.
  // Resgate de aplicação nunca entra aqui — não é venda, distorceria o rateio.
  const valorContabil = (r: any) => r.valor_bruto ?? r.valor
  const receitasFiltradas = unidade === 'consolidado' ? receitas || [] : (receitas || []).filter((r: any) => r.unidade === unidade)
  const receitasFiltradasVenda = receitasFiltradas.filter((r: any) => r.categoria !== 'resgate_aplicacao')

  const somaPorCategoria = new Map<CategoriaReceita, number>()
  Object.keys(CATEGORIA_RECEITA_LABEL)
    .filter((c) => c !== 'resgate_aplicacao')
    .forEach((c) => somaPorCategoria.set(c as CategoriaReceita, 0))
  receitasFiltradasVenda.forEach((r: any) => {
    somaPorCategoria.set(r.categoria, (somaPorCategoria.get(r.categoria) || 0) + valorContabil(r))
  })
  const entradasCaixaPorCategoria = Array.from(somaPorCategoria.entries()).map(([categoria, valor]) => ({
    categoria,
    label: CATEGORIA_RECEITA_LABEL[categoria],
    valor,
  }))
  const totalEntradasCaixa = entradasCaixaPorCategoria.reduce((s, c) => s + c.valor, 0)

  const totalResgatesAplicacao = receitasFiltradas
    .filter((r: any) => r.categoria === 'resgate_aplicacao')
    .reduce((s: number, r: any) => s + valorContabil(r), 0)

  // --- Classificação de despesas e itens de compra por conta ---------------
  const linhasDetalhadas: DreLinhaDetalhe[] = []
  const aportesReservaDetalhados: DreLinhaDetalhe[] = []
  const valorPorConta = new Map<string, number>()

  // Conta de reserva (afeta_dre=false, hoje só 3002): o valor vai pro balde
  // informativo de Aportes em Reserva, não entra na cascata do resultado.
  // conta_id é opcional no banco (lançamento antigo ou sem classificação) —
  // cai no pseudo-id 'sem-conta', que vira parte da seção "Não classificado"
  // mais abaixo, pro valor nunca sumir do resultado silenciosamente.
  function acumular(contaId: string | null | undefined, valor: number, parteId: string, parteNome: string) {
    const chave = contaId || 'sem-conta'
    const linha: DreLinhaDetalhe = { parteId, parteNome, contaId: chave, valor }
    const conta = contaId ? contasPorId.get(contaId) : undefined
    if (conta?.afeta_dre === false) {
      aportesReservaDetalhados.push(linha)
      return
    }
    valorPorConta.set(chave, (valorPorConta.get(chave) || 0) + valor)
    linhasDetalhadas.push(linha)
  }

  ;(despesas || []).forEach((d: any) => {
    const parteNome = d.parte?.nome || 'Sem beneficiário'
    if (unidade === 'consolidado' || d.unidade === unidade) {
      acumular(d.conta_id, d.valor_total, d.parte_id, parteNome)
    } else if (d.unidade === 'rateio') {
      acumular(d.conta_id, d.valor_total * (percentualRateio || 0), d.parte_id, parteNome)
    }
  })

  const compraPorLancamento = new Map((comprasLancamentos || []).map((c: any) => [c.id, c]))
  ;(itens || []).forEach((item: any) => {
    const lancamento: any = compraPorLancamento.get(item.lancamento_id)
    if (!lancamento) return
    const parteNome = lancamento.parte?.nome || 'Sem fornecedor'
    // Mesma regra de rateio das despesas: insumo comprado pela cozinha
    // (unidade='rateio', ex: matéria-prima compartilhada pelas duas lojas)
    // precisa entrar proporcionalmente na visão de cada loja — antes ficava
    // de fora inteiro, e só aparecia certo em Consolidado.
    if (unidade === 'consolidado' || lancamento.unidade === unidade) {
      acumular(item.conta_id, item.valor_total, lancamento.parte_id, parteNome)
    } else if (lancamento.unidade === 'rateio') {
      acumular(item.conta_id, item.valor_total * (percentualRateio || 0), lancamento.parte_id, parteNome)
    }
  })

  const totalAportesReserva = aportesReservaDetalhados.reduce((s, l) => s + l.valor, 0)

  function contasDaLinha(linha: LinhaDre): DreContaValor[] {
    return contas
      .filter((c) => c.linha_dre === linha)
      .map((c) => ({
        contaId: c.id,
        codigo: c.codigo,
        nome: c.nome,
        valor: c.afeta_dre === false ? 0 : valorPorConta.get(c.id) || 0,
        notaZerado: c.afeta_dre === false ? 'Tratado como reserva — ver Aportes em Reserva' : undefined,
      }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo))
  }

  function montarSecao(linha: LinhaDre, contasArr: DreContaValor[], base: number): DreSecao {
    const total = contasArr.reduce((s, c) => s + c.valor, 0)
    return { linha, label: LINHA_DRE_LABEL[linha], contas: contasArr, total, percentual: base > 0 ? (total / base) * 100 : null }
  }

  function montarSecaoNaoClassificada(contasArr: DreContaValor[], base: number): DreSecao {
    const total = contasArr.reduce((s, c) => s + c.valor, 0)
    return { linha: 'nao_classificado', label: 'Não classificado', contas: contasArr, total, percentual: base > 0 ? (total / base) * 100 : null }
  }

  const secaoDeducaoVendas = montarSecao('deducao_vendas', contasDaLinha('deducao_vendas'), totalReceitaBruta)
  const totalReceitaLiquida = totalReceitaBruta - secaoDeducaoVendas.total

  const secaoCmv = montarSecao('cmv', contasDaLinha('cmv'), totalReceitaLiquida)
  const secaoMaoObra = montarSecao('mao_obra_encargos', contasDaLinha('mao_obra_encargos'), totalReceitaLiquida)
  const totalLucroBruto = totalReceitaLiquida - secaoCmv.total - secaoMaoObra.total

  const secaoDespesasOperacionais = montarSecao('despesas_operacionais', contasDaLinha('despesas_operacionais'), totalReceitaLiquida)
  const totalResultadoOperacional = totalLucroBruto - secaoDespesasOperacionais.total

  const secaoResultadoFinanceiro = montarSecao('resultado_financeiro', contasDaLinha('resultado_financeiro'), totalReceitaLiquida)
  const totalLucroLiquidoAntesDistribuicao = totalResultadoOperacional - secaoResultadoFinanceiro.total

  const secaoDistribuicaoLucros = montarSecao('distribuicao_lucros', contasDaLinha('distribuicao_lucros'), totalReceitaLiquida)

  // Rede de segurança: lançamento sem conta_id, ou com conta_id apontando
  // pra uma conta sem linha_dre (não deveria existir com o plano seedado —
  // só cobre um cadastro novo/legado sem classificação). Entra no
  // resultado pra nunca sumir dinheiro silenciosamente, mas fica isolada
  // da cascata "oficial".
  const valorSemConta = valorPorConta.get('sem-conta') || 0
  const contasNaoClassificadas: DreContaValor[] = [
    ...(valorSemConta !== 0 ? [{ contaId: 'sem-conta', codigo: '—', nome: 'Sem conta contábil' }] : []),
    ...contas.filter((c) => !c.linha_dre && c.afeta_dre !== false && (valorPorConta.get(c.id) || 0) !== 0),
  ].map((c: any) => ({ contaId: c.contaId ?? c.id, codigo: c.codigo, nome: c.nome, valor: valorPorConta.get(c.contaId ?? c.id) || 0 }))
  const secaoNaoClassificada = montarSecaoNaoClassificada(contasNaoClassificadas, totalReceitaLiquida)

  const resultado =
    totalLucroLiquidoAntesDistribuicao - secaoDistribuicaoLucros.total - secaoNaoClassificada.total

  const receitasDetalhadas: DreReceitaDetalhe[] = receitasFiltradas.map((r: any) => ({
    categoria: r.categoria,
    data: r.data,
    valor: r.valor,
    valorBruto: r.valor_bruto ?? null,
    observacao: r.observacao,
  }))

  return {
    unidade,
    ano,
    mes,
    totalReceitaBruta,
    secaoDeducaoVendas,
    totalReceitaLiquida,
    secaoCmv,
    secaoMaoObra,
    totalLucroBruto,
    secaoDespesasOperacionais,
    totalResultadoOperacional,
    secaoResultadoFinanceiro,
    totalLucroLiquidoAntesDistribuicao,
    secaoDistribuicaoLucros,
    resultado,
    secaoNaoClassificada,
    entradasCaixaPorCategoria,
    totalEntradasCaixa,
    percentualRateio,
    totalResgatesAplicacao,
    totalAportesReserva,
    receitasDetalhadas,
    linhasDetalhadas,
    aportesReservaDetalhados,
  }
}

/**
 * DRE dos últimos `meses` (default 6), terminando em ano/mes — pra
 * visualizar a evolução das linhas da cascata mês a mês (análise
 * horizontal). Reaproveita buscarDre inteiro, um mês de cada vez, em
 * paralelo — sem duplicar a lógica de cálculo. Mais caro que um mês só
 * (N buscas em vez de 1), mas é uma ação explícita do usuário (alternar
 * pro modo Comparativo), não algo carregado toda hora.
 */
export async function buscarDreComparativo(unidade: VisaoDre, ano: number, mes: number, meses = 6): Promise<DreResultado[]> {
  const pares: { ano: number; mes: number }[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const totalMeses = mes - 1 - i
    const anoDoMes = ano + Math.floor(totalMeses / 12)
    const mesDoMes = ((totalMeses % 12) + 12) % 12
    pares.push({ ano: anoDoMes, mes: mesDoMes + 1 })
  }
  return Promise.all(pares.map((p) => buscarDre(unidade, p.ano, p.mes)))
}
