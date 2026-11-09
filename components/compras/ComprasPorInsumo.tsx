'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, Loader } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import { formatBRL } from '@/lib/ofx'
import { exportarCSV } from '@/lib/csv-export'
import {
  buscarComprasSemItem,
  buscarResumoPorInsumo,
  buscarUltimasComprasDoInsumo,
  ItemCompra,
  ResumoInsumo,
} from '@/lib/financeiro-compras'

// Variação do último preço contra a compra anterior do mesmo insumo; a partir deste
// percentual o insumo ganha destaque vermelho e entra no filtro "Subiram".
export const LIMITE_ALERTA_PCT = 10
// Variação absurda (para cima ou para baixo) quase sempre é erro de lançamento na nota
// (unidade ou quantidade errada), não preço de verdade: ganha um aviso pra conferir.
// +300% = preço 4× maior; −75% = preço 4× menor (queda nunca passa de −100%, por isso a regra é por razão).
export const LIMITE_SUSPEITO_ALTA_PCT = 300
export const LIMITE_SUSPEITO_QUEDA_PCT = -75

type Ordem = 'gasto' | 'variacao' | 'nome'

interface Props {
  inicio: string
  fim: string
  parteId: string
  busca: string
  onVerCompras: (materiaPrimaId: string) => void
}

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const virgula = (n: number) => n.toFixed(2).replace('.', ',')

/** Preço por UNIDADE DE COMPRA (R$/kg, R$/caixa...) — a unidade em que a compra é feita. */
const porUnidadeDeCompra = (precoPorMedida: number | null, fator: number) => (precoPorMedida == null ? null : precoPorMedida * fator)

export default function ComprasPorInsumo({ inicio, fim, parteId, busca, onVerCompras }: Props) {
  const [linhas, setLinhas] = useState<ResumoInsumo[]>([])
  const [semItem, setSemItem] = useState<{ quantidade: number; valor: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('gasto')
  const [soSubiu, setSoSubiu] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Record<string, ItemCompra[] | 'carregando'>>({})

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    setErro('')
    setExpandido(null)
    setDetalhe({})
    Promise.all([buscarResumoPorInsumo({ inicio, fim, parteId, busca }), buscarComprasSemItem(inicio, fim).catch(() => null)])
      .then(([resumo, sem]) => {
        if (cancelado) return
        setLinhas(resumo)
        setSemItem(sem)
      })
      .catch((e) => { if (!cancelado) setErro('Erro ao carregar: ' + (e?.message || 'desconhecido')) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [inicio, fim, parteId, busca])

  const qtdSubiram = useMemo(() => linhas.filter((l) => (l.variacao_pct ?? 0) >= LIMITE_ALERTA_PCT).length, [linhas])

  const exibidas = useMemo(() => {
    let lista = soSubiu ? linhas.filter((l) => (l.variacao_pct ?? 0) >= LIMITE_ALERTA_PCT) : linhas
    lista = [...lista]
    if (ordem === 'nome') lista.sort((a, b) => a.nome.localeCompare(b.nome))
    else if (ordem === 'variacao') lista.sort((a, b) => (b.variacao_pct ?? -Infinity) - (a.variacao_pct ?? -Infinity))
    else lista.sort((a, b) => b.gasto - a.gasto)
    return lista
  }, [linhas, ordem, soSubiu])

  const totalGasto = linhas.reduce((s, l) => s + l.gasto, 0)
  const totalCompras = linhas.reduce((s, l) => s + l.numero_compras, 0)

  async function alternar(l: ResumoInsumo) {
    if (expandido === l.materia_prima_id) {
      setExpandido(null)
      return
    }
    setExpandido(l.materia_prima_id)
    if (detalhe[l.materia_prima_id]) return
    setDetalhe((d) => ({ ...d, [l.materia_prima_id]: 'carregando' }))
    try {
      const compras = await buscarUltimasComprasDoInsumo(l.materia_prima_id, fim, parteId || undefined)
      setDetalhe((d) => ({ ...d, [l.materia_prima_id]: compras }))
    } catch {
      setDetalhe((d) => ({ ...d, [l.materia_prima_id]: [] }))
    }
  }

  function exportar() {
    const linhasCsv = exibidas.map((l) => ({
      insumo: l.nome,
      quantidade: fmtQtd(l.quantidade_convertida),
      unidade_medida: l.unidade_medida,
      compras: l.numero_compras,
      gasto: virgula(l.gasto),
      preco_medio: porUnidadeDeCompra(l.preco_medio_unidade_medida, l.fator_unidade_compra) != null ? virgula(porUnidadeDeCompra(l.preco_medio_unidade_medida, l.fator_unidade_compra) as number) : '',
      ultimo_preco: porUnidadeDeCompra(l.ultimo_preco_unidade_medida, l.fator_unidade_compra) != null ? virgula(porUnidadeDeCompra(l.ultimo_preco_unidade_medida, l.fator_unidade_compra) as number) : '',
      unidade_compra: l.unidade_compra,
      ultima_compra: l.ultima_compra ? fmtData(l.ultima_compra) : '',
      variacao_pct: l.variacao_pct == null ? '' : l.variacao_pct.toFixed(1).replace('.', ','),
      fornecedor_principal: l.fornecedor_principal ?? '',
    }))
    exportarCSV(
      linhasCsv,
      ['insumo', 'quantidade', 'unidade_medida', 'compras', 'gasto', 'preco_medio', 'ultimo_preco', 'unidade_compra', 'ultima_compra', 'variacao_pct', 'fornecedor_principal'],
      'compras-por-insumo'
    )
  }

  const cabecalhoOrdenavel = (rotulo: string, chave: Ordem) => (
    <button onClick={() => setOrdem(chave)} className={`inline-flex items-center gap-1 ${ordem === chave ? 'text-pink-700 font-bold' : ''}`}>
      {rotulo} {ordem === chave && <ArrowDown size={12} />}
    </button>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Loader size={18} className="animate-spin" /> Carregando...
      </div>
    )
  }
  if (erro) return <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro} (o SQL da fase 5 já foi rodado?)</div>

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-500" title="Soma dos itens das notas. Não inclui juros, multa nem frete lançados na nota.">Gasto em itens</p>
          <p className="text-lg font-bold text-gray-900">{formatBRL(totalGasto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Insumos comprados</p>
          <p className="text-lg font-bold text-gray-900">{linhas.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <p className="text-xs text-gray-500">Itens de nota</p>
          <p className="text-lg font-bold text-gray-900">{totalCompras}</p>
        </div>
        <button
          onClick={() => setSoSubiu((v) => !v)}
          className={`text-left rounded-xl border p-3 ${soSubiu ? 'bg-red-600 border-red-600' : qtdSubiram > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}
        >
          <p className={`text-xs ${soSubiu ? 'text-red-100' : qtdSubiram > 0 ? 'text-red-700' : 'text-gray-500'}`}>
            Subiram {LIMITE_ALERTA_PCT}%+ {soSubiu ? '(filtrando)' : ''}
          </p>
          <p className={`text-lg font-bold ${soSubiu ? 'text-white' : qtdSubiram > 0 ? 'text-red-600' : 'text-gray-900'}`}>{qtdSubiram}</p>
        </button>
      </div>

      {semItem && semItem.quantidade > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
          Há <strong>{semItem.quantidade}</strong> despesa(s) em contas de insumo <strong>sem item cadastrado</strong> neste período ({formatBRL(semItem.valor)}).
          Elas não entram nesta análise por insumo.{' '}
          <Link href={`/financeiro/despesas?status=todas&de=${inicio}&ate=${fim}`} className="font-semibold underline">Ver em Despesas</Link>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-gray-500">
          Preços por unidade de compra (R$/kg, R$/caixa...). Variação = último preço contra a compra anterior do mesmo insumo.
        </p>
        <button
          onClick={exportar}
          disabled={exibidas.length === 0}
          className="flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex-shrink-0"
        >
          <Download size={14} /> CSV
        </button>
      </div>

      {exibidas.length === 0 ? (
        <EmptyState title="Nenhuma compra neste filtro" description="Ajuste o período, o fornecedor ou a busca." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 px-3 w-6"></th>
                <th className="py-2 px-3">{cabecalhoOrdenavel('Insumo', 'nome')}</th>
                <th className="py-2 px-3 text-right">Quantidade</th>
                <th className="py-2 px-3 text-right">{cabecalhoOrdenavel('Gasto', 'gasto')}</th>
                <th className="py-2 px-3 text-right">Preço médio</th>
                <th className="py-2 px-3 text-right">Último preço</th>
                <th className="py-2 px-3 text-right">{cabecalhoOrdenavel('Variação', 'variacao')}</th>
                <th className="py-2 px-3">Fornecedor principal</th>
              </tr>
            </thead>
            <tbody>
              {exibidas.map((l) => {
                const aberto = expandido === l.materia_prima_id
                const medio = porUnidadeDeCompra(l.preco_medio_unidade_medida, l.fator_unidade_compra)
                const ultimo = porUnidadeDeCompra(l.ultimo_preco_unidade_medida, l.fator_unidade_compra)
                const v = l.variacao_pct
                const compras = detalhe[l.materia_prima_id]
                return (
                  <Fragment key={l.materia_prima_id}>
                    <tr onClick={() => alternar(l)} className="border-b border-gray-100 cursor-pointer hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-400">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                      <td className="py-2 px-3 font-medium text-gray-800">
                        {l.nome}
                        <span className="block text-xs text-gray-400 font-normal">{l.numero_compras} compra(s)</span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600 whitespace-nowrap">{fmtQtd(l.quantidade_convertida)} {l.unidade_medida}</td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatBRL(l.gasto)}</td>
                      <td
                        className="py-2 px-3 text-right text-gray-700 whitespace-nowrap"
                        title={l.preco_medio_unidade_medida != null ? `${formatBRL(l.preco_medio_unidade_medida)}/${l.unidade_medida}` : ''}
                      >
                        {medio != null ? <>{formatBRL(medio)}<span className="text-xs text-gray-400">/{l.unidade_compra}</span></> : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-700 whitespace-nowrap">
                        {ultimo != null ? <>{formatBRL(ultimo)}<span className="text-xs text-gray-400">/{l.unidade_compra}</span></> : '—'}
                        {l.ultima_compra && <span className="block text-xs text-gray-400">{fmtData(l.ultima_compra)}</span>}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        {v == null ? (
                          <span className="text-gray-300" title="Só uma compra: nada a comparar">—</span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-0.5 font-semibold ${
                              v >= LIMITE_ALERTA_PCT ? 'text-red-600' : v > 0 ? 'text-amber-600' : v < 0 ? 'text-green-600' : 'text-gray-500'
                            }`}
                          >
                            {v > 0 ? <ArrowUp size={13} /> : v < 0 ? <ArrowDown size={13} /> : null}
                            {fmtPct(v)}
                            {(v >= LIMITE_SUSPEITO_ALTA_PCT || v <= LIMITE_SUSPEITO_QUEDA_PCT) && (
                              <span title="Variação muito grande: confira unidade e quantidade nas últimas notas deste insumo (provável erro de lançamento)">
                                <AlertTriangle size={13} className="text-amber-500 ml-0.5" />
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-600">{l.fornecedor_principal || '—'}</td>
                    </tr>
                    {aberto && (
                      <tr className="bg-gray-50/70 border-b border-gray-100">
                        <td></td>
                        <td colSpan={7} className="py-3 px-3">
                          {compras === 'carregando' || !compras ? (
                            <span className="text-xs text-gray-400">Carregando compras...</span>
                          ) : compras.length === 0 ? (
                            <span className="text-xs text-gray-400">Sem compras para mostrar.</span>
                          ) : (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Últimas compras</p>
                              <ul className="space-y-1 mb-3">
                                {compras.map((c) => (
                                  <li key={c.id} className="text-xs text-gray-600 flex flex-wrap gap-x-3">
                                    <span className="font-medium text-gray-700">{fmtData(c.data_lancamento)}</span>
                                    <span>{c.fornecedor_nome}</span>
                                    <span>{fmtQtd(c.quantidade)} {c.unidade_nota}</span>
                                    <span>{formatBRL(c.valor_total)}</span>
                                  </li>
                                ))}
                              </ul>
                              <div className="flex gap-4">
                                <button onClick={() => onVerCompras(l.materia_prima_id)} className="text-xs font-semibold text-pink-700 hover:underline">
                                  Ver todas as compras deste insumo →
                                </button>
                                <Link href={`/financeiro/materias-primas/${l.materia_prima_id}`} className="text-xs font-semibold text-pink-700 hover:underline">
                                  Abrir o insumo →
                                </Link>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
