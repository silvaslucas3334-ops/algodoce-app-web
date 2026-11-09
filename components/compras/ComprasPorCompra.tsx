'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Loader, X } from 'lucide-react'
import EmptyState from '@/components/EmptyState'
import { formatBRL } from '@/lib/ofx'
import { exportarCSV } from '@/lib/csv-export'
import {
  buscarPaginaItens,
  buscarTodosItens,
  buscarTotalItens,
  FiltroItens,
  ItemCompra,
  OrdemItens,
} from '@/lib/financeiro-compras'

const TAMANHO_PAGINA = 50

interface Props {
  inicio: string
  fim: string
  parteId: string
  busca: string
  materiaPrimaId: string
  ordem: OrdemItens
  urlAtual: string // para "Ver nota" voltar exatamente pra esta visão
  onOrdem: (o: OrdemItens) => void
  onLimparInsumo: () => void
}

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const virgula = (n: number) => n.toFixed(2).replace('.', ',')

const ORDENS: { key: OrdemItens; label: string }[] = [
  { key: 'data', label: 'Mais recentes' },
  { key: 'valor', label: 'Maior valor' },
  { key: 'insumo', label: 'Insumo A–Z' },
]

export default function ComprasPorCompra({ inicio, fim, parteId, busca, materiaPrimaId, ordem, urlAtual, onOrdem, onLimparInsumo }: Props) {
  const [itens, setItens] = useState<ItemCompra[]>([])
  const [total, setTotal] = useState(0)
  const [soma, setSoma] = useState<{ valor: number; compras: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [erro, setErro] = useState('')
  const requisicao = useRef(0)

  const filtro: FiltroItens = { inicio, fim, parteId: parteId || undefined, materiaPrimaId: materiaPrimaId || undefined, busca }

  const carregar = useCallback(async () => {
    const numero = ++requisicao.current
    setLoading(true)
    setErro('')
    try {
      const f: FiltroItens = { inicio, fim, parteId: parteId || undefined, materiaPrimaId: materiaPrimaId || undefined, busca }
      const [pagina, totais] = await Promise.all([buscarPaginaItens(f, ordem, 0, TAMANHO_PAGINA), buscarTotalItens(f)])
      if (numero !== requisicao.current) return
      setItens(pagina.itens)
      setTotal(pagina.total)
      setSoma(totais)
    } catch (e: any) {
      if (numero === requisicao.current) setErro('Erro ao carregar: ' + (e?.message || 'desconhecido'))
    } finally {
      if (numero === requisicao.current) setLoading(false)
    }
  }, [inicio, fim, parteId, busca, materiaPrimaId, ordem])

  useEffect(() => { carregar() }, [carregar])

  async function carregarMais() {
    setCarregandoMais(true)
    try {
      const pagina = await buscarPaginaItens(filtro, ordem, itens.length, TAMANHO_PAGINA)
      setItens((prev) => {
        const ja = new Set(prev.map((x) => x.id))
        return [...prev, ...pagina.itens.filter((x) => !ja.has(x.id))]
      })
    } catch (e: any) {
      setErro('Erro ao carregar mais: ' + (e?.message || 'desconhecido'))
    } finally {
      setCarregandoMais(false)
    }
  }

  async function exportar() {
    setExportando(true)
    try {
      const todos = await buscarTodosItens(filtro, ordem)
      exportarCSV(
        todos.map((i) => ({
          data: fmtData(i.data_lancamento),
          insumo: i.materia_prima_nome,
          fornecedor: i.fornecedor_nome,
          nota: i.numero_documento ?? '',
          quantidade: fmtQtd(i.quantidade),
          unidade_nota: i.unidade_nota,
          valor_unitario: virgula(i.valor_unitario),
          total: virgula(i.valor_total),
        })),
        ['data', 'insumo', 'fornecedor', 'nota', 'quantidade', 'unidade_nota', 'valor_unitario', 'total'],
        'compras-por-compra'
      )
    } catch (e: any) {
      alert('Erro ao exportar: ' + (e?.message || 'desconhecido'))
    } finally {
      setExportando(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ORDENS.map((o) => (
          <button
            key={o.key}
            onClick={() => onOrdem(o.key)}
            className={`px-3 py-1 rounded-full text-xs border ${ordem === o.key ? 'bg-pink-100 text-pink-700 border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {o.label}
          </button>
        ))}
        {materiaPrimaId && (
          <span className="inline-flex items-center gap-1 bg-gray-800 text-white text-xs font-semibold rounded-full pl-3 pr-1.5 py-1">
            Só um insumo
            <button onClick={onLimparInsumo} className="rounded-full p-0.5 hover:bg-gray-600" aria-label="Remover filtro de insumo"><X size={12} /></button>
          </span>
        )}
        <button
          onClick={exportar}
          disabled={exportando || total === 0}
          className="ml-auto flex items-center gap-1.5 text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          {exportando ? <Loader size={14} className="animate-spin" /> : <Download size={14} />} CSV
        </button>
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{erro} (o SQL da fase 5 já foi rodado?)</div>}

      {!loading && soma && total > 0 && (
        <p className="text-xs text-gray-500 mb-3">
          {total} item(ns) de nota · total <strong className="text-gray-800">{formatBRL(soma.valor)}</strong>
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader size={18} className="animate-spin" /> Carregando...</div>
      ) : itens.length === 0 ? (
        <EmptyState title="Nenhuma compra neste filtro" description="Ajuste o período, o fornecedor ou a busca." />
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 px-3">Data</th>
                  <th className="py-2 px-3">Insumo</th>
                  <th className="py-2 px-3">Fornecedor</th>
                  <th className="py-2 px-3 text-right">Quantidade</th>
                  <th className="py-2 px-3 text-right">Valor unit.</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fmtData(i.data_lancamento)}</td>
                    <td className="py-2 px-3 font-medium text-gray-800">{i.materia_prima_nome}</td>
                    <td className="py-2 px-3 text-gray-600">
                      {i.fornecedor_nome}
                      {i.numero_documento && <span className="block text-xs text-gray-400">NF {i.numero_documento}</span>}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-600 whitespace-nowrap">{fmtQtd(i.quantidade)} {i.unidade_nota}</td>
                    <td className="py-2 px-3 text-right text-gray-600 whitespace-nowrap">{formatBRL(i.valor_unitario)}/{i.unidade_nota}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{formatBRL(i.valor_total)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <Link
                        href={`/financeiro/despesas/${i.lancamento_id}?voltarPara=${encodeURIComponent(urlAtual)}`}
                        className="text-pink-700 hover:underline text-xs font-medium"
                      >
                        Ver nota
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {itens.length < total && (
            <div className="mt-4 text-center">
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {carregandoMais && <Loader size={14} className="animate-spin" />}
                Carregar mais ({total - itens.length} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
