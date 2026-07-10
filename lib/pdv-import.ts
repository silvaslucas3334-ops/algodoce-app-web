import * as XLSX from 'xlsx'
import { supabase } from './supabase'
import { PDV_STATUS_CONHECIDOS, PDV_TIPO_ITEM_CONHECIDOS } from './constants'

// --- leitura de planilha com cabeçalhos tolerantes a pontuação -----------
// Os exports do PDV têm pontuação inconsistente entre colunas ("Valor. Tot.
// Item" tem ponto sobrando, "Valor Un. Item" não) — mapear por cabeçalho
// normalizado em vez de string literal evita quebrar se uma exportação
// futura vier com a pontuação levemente diferente.

function normalizarCabecalho(h: string): string {
  return h.toLowerCase().replace(/[.?]/g, '').replace(/\s+/g, ' ').trim()
}

interface PlanilhaLida {
  linhas: Record<string, any>[]
  col: (chaveNormalizada: string) => string
}

async function lerPlanilha(file: File): Promise<PlanilhaLida> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]] // exports do PDV são planilha única
  const linhas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: null })
  const headerRow: any[] = (XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 })[0] as any[]) || []
  const mapa = new Map<string, string>()
  headerRow.forEach((h) => {
    if (h != null && String(h).trim()) mapa.set(normalizarCabecalho(String(h)), String(h))
  })
  return { linhas, col: (chave: string) => mapa.get(chave) || '' }
}

function campo(linha: Record<string, any>, col: (c: string) => string, chave: string): any {
  const c = col(chave)
  return c ? linha[c] : undefined
}

// --- datas -----------------------------------------------------------------
// SheetJS (cellDates:true) devolve Date cujos getters UTC carregam o valor
// literal da célula (hora de São Paulo, sem fuso aplicado) — não interpreta
// timezone. Se a coluna vier como texto puro ("4/23/26 11:35", formato visto
// nos exports reais) em vez de célula-data, tratamos os dois casos. Nunca
// usar .toISOString() direto num Date do SheetJS: entra 3h adiantado no banco
// (mesma classe de bug já corrigida em parseUTC() de app/admin/relatorios.tsx,
// na direção oposta). Brasil não tem mais horário de verão desde 2019.
export function paraTimestampSP(valor: unknown): string {
  const pad = (n: number | string) => String(n).padStart(2, '0')

  if (valor instanceof Date) {
    return (
      `${valor.getUTCFullYear()}-${pad(valor.getUTCMonth() + 1)}-${pad(valor.getUTCDate())}` +
      `T${pad(valor.getUTCHours())}:${pad(valor.getUTCMinutes())}:${pad(valor.getUTCSeconds())}-03:00`
    )
  }

  const texto = String(valor ?? '').trim()
  const m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const [, mes, dia, anoRaw, hora = '0', min = '0', seg = '0'] = m
    const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw
    return `${ano}-${pad(mes)}-${pad(dia)}T${pad(hora)}:${pad(min)}:${pad(seg)}-03:00`
  }

  throw new Error(`Data/hora não reconhecida: "${texto}"`)
}

function paraNumero(valor: unknown): number {
  if (valor == null || valor === '') return 0
  const n = Number(String(valor).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

// --- parsing dos dois arquivos ----------------------------------------------

export interface PdvItemRaw {
  codPed: string
  dataHoraItem: string
  quantidade: number
  valorUnitario: number
  valorTotalItem: number
  tipoItem: string
  nomeProd: string
  tipoProd: string | null
  catProd: string | null
}

export interface PdvPedidoRaw {
  codigo: string
  dataAbertura: string
  dataFechamento: string | null
  status: string
  totItens: number
  servico: number
  desconto: number
  valorEntrega: number
  total: number
  totalRecebido: number | null
  formaPagamento: string | null
  notaEmitida: boolean
  serieNf: string | null
  numeroNf: string | null
}

export async function parseHistoricoItens(file: File): Promise<PdvItemRaw[]> {
  const { linhas, col } = await lerPlanilha(file)
  return linhas
    // Exports do PDV podem terminar com uma linha residual sem dados reais
    // (ex: linha de total/resumo que o próprio sistema anexa) — só "Cod.
    // Ped." preenchido não basta pra considerar a linha um item de verdade,
    // por isso exige também a data do item.
    .filter((linha) => campo(linha, col, 'cod ped') != null && campo(linha, col, 'data/hora item') != null)
    .map((linha) => ({
      codPed: String(campo(linha, col, 'cod ped')).trim(),
      dataHoraItem: paraTimestampSP(campo(linha, col, 'data/hora item')),
      quantidade: paraNumero(campo(linha, col, 'qtd')),
      valorUnitario: paraNumero(campo(linha, col, 'valor un item')),
      valorTotalItem: paraNumero(campo(linha, col, 'valor tot item')),
      tipoItem: String(campo(linha, col, 'tipo de item') ?? '').trim(),
      nomeProd: String(campo(linha, col, 'nome prod') ?? '').trim(),
      tipoProd: campo(linha, col, 'tipo prod') || null,
      catProd: campo(linha, col, 'cat prod') || null,
    }))
}

export async function parseFinalizados(file: File): Promise<PdvPedidoRaw[]> {
  const { linhas, col } = await lerPlanilha(file)
  return linhas
    // Mesma razão do Histórico: já vimos na prática uma linha residual no
    // fim do export real do usuário (Código preenchido, todo o resto nulo,
    // incluindo Data Abertura) — exigir a data também descarta essa linha
    // sem descartar nenhum pedido de verdade.
    .filter((linha) => campo(linha, col, 'código') != null && campo(linha, col, 'data abertura') != null)
    .map((linha) => ({
      codigo: String(campo(linha, col, 'código')).trim(),
      dataAbertura: paraTimestampSP(campo(linha, col, 'data abertura')),
      dataFechamento: campo(linha, col, 'data fechamento') ? paraTimestampSP(campo(linha, col, 'data fechamento')) : null,
      status: String(campo(linha, col, 'status') ?? '').trim(),
      totItens: paraNumero(campo(linha, col, 'tot itens')),
      servico: paraNumero(campo(linha, col, 'serviço')),
      desconto: paraNumero(campo(linha, col, 'desconto')),
      valorEntrega: paraNumero(campo(linha, col, 'valor entrega')),
      total: paraNumero(campo(linha, col, 'total')),
      totalRecebido: paraNumero(campo(linha, col, 'total recebido')),
      formaPagamento: campo(linha, col, 'forma de pagto') || null,
      notaEmitida: String(campo(linha, col, 'nota emitida') ?? '') === '1' || String(campo(linha, col, 'nota emitida') ?? '').toLowerCase() === 'sim',
      serieNf: campo(linha, col, 'série nf') ? String(campo(linha, col, 'série nf')) : null,
      numeroNf: campo(linha, col, 'número nf') ? String(campo(linha, col, 'número nf')) : null,
    }))
}

// --- período -----------------------------------------------------------

export function detectarPeriodo(pedidos: PdvPedidoRaw[]): { min: string; max: string } {
  if (pedidos.length === 0) throw new Error('Nenhum pedido encontrado no arquivo Finalizados.')
  // p.dataAbertura já é a string ISO com offset produzida por paraTimestampSP
  // (convertida em parseFinalizados) — só recortar a parte de data, nunca
  // reprocessar: paraTimestampSP espera valor BRUTO da planilha (Date ou
  // "M/D/YY HH:MM"), não uma ISO já pronta, e rejeitaria de volta.
  const datas = pedidos.map((p) => p.dataAbertura.slice(0, 10)).sort()
  return { min: datas[0], max: datas[datas.length - 1] }
}

export async function contarPedidosExistentes(unidade: 'loja1' | 'loja2', dataMin: string, dataMax: string): Promise<number> {
  const { count, error } = await supabase
    .from('financeiro_pdv_pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('unidade', unidade)
    .gte('data_abertura', `${dataMin}T00:00:00-03:00`)
    .lte('data_abertura', `${dataMax}T23:59:59-03:00`)
  if (error) throw new Error(error.message)
  return count || 0
}

// --- montagem do payload -------------------------------------------------

export interface ResultadoMontagem {
  pedidos: any[] // payload pronto pra RPC (snake_case)
  itens: any[]
  avisos: string[] // status/tipo_item desconhecido — não bloqueia
  erros: string[] // item órfão (Cod. Ped. sem pedido correspondente) — bloqueia
}

export function montarPayloadImportacao(pedidosRaw: PdvPedidoRaw[], itensRaw: PdvItemRaw[]): ResultadoMontagem {
  const avisos: string[] = []
  const erros: string[] = []
  const codigosPedido = new Set(pedidosRaw.map((p) => p.codigo))

  pedidosRaw.forEach((p) => {
    if (!PDV_STATUS_CONHECIDOS.includes(p.status)) {
      avisos.push(`Pedido ${p.codigo}: status "${p.status}" não reconhecido — foi importado mesmo assim, mas não conta como receita nos relatórios.`)
    }
  })

  // Agrupa itens por pedido preservando a ordem do arquivo, pra numerar
  // ordem_pedido corretamente (0..n-1 DENTRO de cada pedido).
  const itensPorPedido = new Map<string, PdvItemRaw[]>()
  for (const item of itensRaw) {
    if (!codigosPedido.has(item.codPed)) {
      erros.push(`Item "${item.nomeProd}" referencia o pedido ${item.codPed}, que não existe no arquivo Finalizados. Confira se os dois arquivos são do mesmo período.`)
      continue
    }
    if (!PDV_TIPO_ITEM_CONHECIDOS.includes(item.tipoItem)) {
      avisos.push(`Item "${item.nomeProd}" (pedido ${item.codPed}) tem "Tipo de Item" = "${item.tipoItem}", não reconhecido — foi importado mesmo assim.`)
    }
    if (!itensPorPedido.has(item.codPed)) itensPorPedido.set(item.codPed, [])
    itensPorPedido.get(item.codPed)!.push(item)
  }

  const pedidos = pedidosRaw.map((p) => ({
    codigo: p.codigo,
    data_abertura: p.dataAbertura,
    data_fechamento: p.dataFechamento,
    status: p.status,
    tot_itens: p.totItens,
    servico: p.servico,
    desconto: p.desconto,
    valor_entrega: p.valorEntrega,
    total: p.total,
    total_recebido: p.totalRecebido,
    forma_pagamento: p.formaPagamento,
    nota_emitida: p.notaEmitida,
    serie_nf: p.serieNf,
    numero_nf: p.numeroNf,
  }))

  const itens: any[] = []
  itensPorPedido.forEach((itensDoPedido, codPed) => {
    itensDoPedido.forEach((item, idx) => {
      itens.push({
        cod_ped: codPed,
        ordem_pedido: idx,
        data_hora_item: item.dataHoraItem,
        quantidade: item.quantidade,
        valor_unitario: item.valorUnitario,
        valor_total_item: item.valorTotalItem,
        tipo_item: item.tipoItem,
        nome_produto: item.nomeProd,
        tipo_produto: item.tipoProd,
        categoria_produto: item.catProd,
        codigo_produto_pdv: null,
      })
    })
  })

  return { pedidos, itens, avisos, erros }
}

// --- import destrutivo ("substituir período") -----------------------------

export interface ResultadoImportacao {
  periodoMin: string
  periodoMax: string
  pedidosRemovidos: number
  pedidosInseridos: number
  itensInseridos: number
  avisos: string[]
}

/**
 * Substitui todos os pedidos/itens de uma unidade dentro do período detectado
 * no arquivo Finalizados. NÃO pede confirmação — isso acontece na tela antes
 * de chamar esta função (ver app/financeiro/pdv/importar/page.tsx). Ao ser
 * chamada, a operação já é destrutiva e definitiva.
 */
export async function substituirPeriodoPDV(
  unidade: 'loja1' | 'loja2',
  pedidosRaw: PdvPedidoRaw[],
  itensRaw: PdvItemRaw[],
  usuarioId: string
): Promise<ResultadoImportacao> {
  const { min, max } = detectarPeriodo(pedidosRaw)
  const { pedidos, itens, avisos, erros } = montarPayloadImportacao(pedidosRaw, itensRaw)
  if (erros.length > 0) throw new Error(erros.join('\n'))

  const { data, error } = await supabase.rpc('financeiro_pdv_substituir_periodo', {
    p_unidade: unidade,
    p_data_min: min,
    p_data_max: max,
    p_pedidos: pedidos,
    p_itens: itens,
    p_importado_por: usuarioId,
  })
  if (error) throw new Error(error.message)

  return {
    periodoMin: min,
    periodoMax: max,
    pedidosRemovidos: data.pedidos_removidos,
    pedidosInseridos: data.pedidos_inseridos,
    itensInseridos: data.itens_inseridos,
    avisos,
  }
}
