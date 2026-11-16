'use client'
import type { DreResultado } from '@/lib/financeiro-dre'
import { BasePercentual, calcularVariacao, percentualSobre, TomVariacao, valorDaBase } from '@/lib/financeiro-dre-apresentacao'
import { formatBRL } from '@/lib/ofx'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const COR_TOM: Record<TomVariacao, string> = {
  bom: 'text-green-700',
  ruim: 'text-red-600',
  neutro: 'text-gray-500',
  nenhum: 'text-gray-400',
}
const SETA: Record<TomVariacao, string> = { bom: '▲', ruim: '▼', neutro: '', nenhum: '' }

interface Props {
  dados: DreResultado
  /** mês anterior: undefined = ainda carregando; null = não existe / sem dados */
  anterior: DreResultado | null | undefined
  /** mês corrente: comparar o parcial com o mês cheio anterior engana, então não mostra variação */
  parcial: boolean
  mesAnterior: number
  base: BasePercentual
}

interface Tile {
  id: string
  rotulo: string
  valor: number
  anterior: number | null
  modo: 'percentual' | 'absoluto'
  destaque?: boolean
}

export default function DreKpis({ dados, anterior, parcial, mesAnterior, base }: Props) {
  const baseValor = valorDaBase(dados, base)
  const ref = anterior && anterior.temDados ? anterior : null
  const tiles: Tile[] = [
    { id: 'rl', rotulo: 'Receita líquida', valor: dados.totalReceitaLiquida, anterior: ref ? ref.totalReceitaLiquida : null, modo: 'percentual' },
    { id: 'lb', rotulo: 'Lucro bruto', valor: dados.totalLucroBruto, anterior: ref ? ref.totalLucroBruto : null, modo: 'percentual' },
    { id: 'ro', rotulo: 'Resultado operacional', valor: dados.totalResultadoOperacional, anterior: ref ? ref.totalResultadoOperacional : null, modo: 'absoluto' },
    { id: 'rf', rotulo: 'Resultado líquido', valor: dados.resultado, anterior: ref ? ref.resultado : null, modo: 'absoluto', destaque: true },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => {
        // a receita líquida só ganha "% da base" quando a base é a bruta (100% dela mesma não informa nada)
        const margem = t.id === 'rl' && base === 'liquida' ? null : percentualSobre(t.valor, baseValor)
        const v = calcularVariacao(t.valor, t.anterior, t.modo, 'ganho')
        const corValor = t.destaque ? (t.valor >= 0 ? 'text-green-700' : 'text-red-700') : 'text-gray-800'
        return (
          <div
            key={t.id}
            className={`rounded-xl border px-4 py-3 ${
              t.destaque ? (t.valor >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : 'bg-white border-gray-100'
            }`}
          >
            <p className="text-xs font-medium text-gray-500">{t.rotulo}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${corValor}`}>{formatBRL(t.valor)}</p>
            <p className="text-xs mt-1 min-h-[16px]">
              {parcial ? (
                <span className="text-gray-400">mês parcial — sem comparação</span>
              ) : anterior === undefined ? (
                <span className="text-gray-300">comparando…</span>
              ) : v.tom === 'nenhum' ? (
                <span className="text-gray-400">sem mês anterior</span>
              ) : (
                <span className={COR_TOM[v.tom]}>
                  {SETA[v.tom]} {v.texto} <span className="text-gray-400">vs {MESES_ABREV[mesAnterior - 1]}</span>
                </span>
              )}
            </p>
            {margem != null && <p className="text-xs text-gray-400 mt-0.5">{margem.toFixed(1).replace('.', ',')}% da receita {base === 'bruta' ? 'bruta' : 'líquida'}</p>}
          </div>
        )
      })}
    </div>
  )
}
