'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  buscarFaturamentoPorLojaDoMes,
  buscarMetaDiariaPorLoja,
  calcularComparativoAte,
  corComparacao,
  FaturamentoPorLoja,
  MetaDiariaLoja,
} from '@/lib/financeiro-fluxo-mensal'
import { hojeISO } from '@/lib/financeiro-utils'
import { UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'

function corTexto(cor: 'azul' | 'laranja' | 'verde'): string {
  if (cor === 'verde') return 'text-green-600'
  if (cor === 'laranja') return 'text-amber-600'
  return 'text-blue-600'
}

interface Props {
  ano: number
  mes: number
  dia: string | null // null = quebra do Total do mês
  diaIndex: number | null // índice dentro de dados.dias — null quando dia é null
  anchorRect: DOMRect
  onClose: () => void
}

const LARGURA = 300
const MARGEM = 8

// Popover de navegação da linha Faturamento — clique num dia ou no Total
// do mês mostra a quebra por loja (Paraisópolis x Itajubá), mesmo padrão
// de posicionamento (sem lib) de components/FluxoDiaPopover.tsx.
export default function FluxoFaturamentoPopover({ ano, mes, dia, diaIndex, anchorRect, onClose }: Props) {
  const [porLoja, setPorLoja] = useState<FaturamentoPorLoja[] | null>(null)
  const [metas, setMetas] = useState<MetaDiariaLoja[] | null>(null)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [pos, setPos] = useState({ top: anchorRect.bottom + 4, left: anchorRect.left })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelado = false
    Promise.all([buscarFaturamentoPorLojaDoMes(ano, mes), buscarMetaDiariaPorLoja(ano, mes)])
      .then(([dataPorLoja, dataMetas]) => {
        if (cancelado) return
        setPorLoja(dataPorLoja)
        setMetas(dataMetas)
      })
      .catch((err) => { if (!cancelado) setErro('Erro ao carregar: ' + (err?.message || 'desconhecido')) })
    return () => { cancelado = true }
  }, [ano, mes])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const altura = el.offsetHeight
    let left = anchorRect.left
    if (left + LARGURA > window.innerWidth - MARGEM) left = anchorRect.right - LARGURA
    left = Math.max(MARGEM, left)

    let top = anchorRect.bottom + 4
    if (top + altura > window.innerHeight - MARGEM) top = anchorRect.top - altura - 4
    top = Math.max(MARGEM, top)

    setPos({ top, left })
    setPronto(true)
  }, [anchorRect, porLoja, metas, erro])

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [onClose])

  const titulo = dia ? new Date(dia + 'T00:00:00').toLocaleDateString('pt-BR') : 'Total do mês'

  // Por dia: valor pontual de cada loja naquele índice. No mês: soma do porDia inteiro.
  const linhas = porLoja?.map((l) => {
    const ehForecast = diaIndex != null ? l.ehForecastPorDia[diaIndex] : l.ehForecastPorDia.some(Boolean)
    const valor = diaIndex != null ? l.porDia[diaIndex] || 0 : l.porDia.reduce<number>((s, v) => s + (v || 0), 0)
    return { loja: l.loja, valor, ehForecast }
  })
  const total = linhas?.reduce((s, l) => s + l.valor, 0) || 0

  // Comparativo acumulado do dia 1 até a data clicada: até hoje é faturamento
  // real; num dia futuro vira projeção (real até hoje + previsão dos dias
  // seguintes) contra a meta acumulada até aquele dia. No Total do mês não
  // existe uma data específica — segue "até hoje" (clicar no dia de hoje dá o mesmo).
  const hoje = hojeISO()
  const ateData = dia ?? hoje
  const comparativo = porLoja && metas ? calcularComparativoAte(porLoja, metas, ano, mes, ateData) : null
  const tituloComparativo =
    dia == null || dia === hoje
      ? 'Até hoje'
      : `${dia < hoje ? 'Até' : 'Projeção até'} ${new Date(dia + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: LARGURA, visibility: pronto ? 'visible' : 'hidden' }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-800">Faturamento</p>
          <p className="text-xs text-gray-500">{titulo}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      {!erro && comparativo && (
        <div className="px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">📊 {tituloComparativo} (mês)</p>
          <div className="space-y-1.5">
            {comparativo.map((c) => {
              const cor = c.metaAcumulada != null ? corComparacao(c.metaAcumulada, c.faturamentoAcumulado, 'receita') : null
              return (
                <div key={c.loja} className="flex items-center justify-between text-sm">
                  <span className={c.incluiProjecao ? 'text-gray-500 italic' : 'text-gray-700'}>{UNIDADE_LABEL[c.loja]}</span>
                  <span className={`font-medium ${cor ? corTexto(cor) : 'text-gray-800'} ${c.incluiProjecao ? 'italic' : ''}`}>
                    {formatBRL(c.faturamentoAcumulado)}
                    {c.metaAcumulada != null && <span className="text-gray-400 font-normal"> / {formatBRL(c.metaAcumulada)}</span>}
                  </span>
                </div>
              )
            })}
            {comparativo.some((c) => c.incluiProjecao) && (
              <p className="text-[11px] text-gray-400 pt-0.5">Projeção: faturamento real até hoje + previsão (média histórica) dos dias seguintes.</p>
            )}
          </div>
        </div>
      )}

      <div className="p-3">
        {erro && <p className="text-xs text-red-600">{erro}</p>}

        {!erro && !linhas && <p className="text-xs text-gray-400 text-center py-3">Carregando...</p>}

        {!erro && linhas && (
          <div className="space-y-1.5">
            {linhas.map((l) => (
              <div key={l.loja} className="flex items-center justify-between text-sm">
                <span className={l.ehForecast ? 'text-gray-400 italic' : 'text-gray-700'}>{UNIDADE_LABEL[l.loja]}</span>
                <span className={`font-medium ${l.ehForecast ? 'text-gray-400 italic' : 'text-gray-800'}`}>{formatBRL(l.valor)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm pt-1.5 border-t border-gray-100">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-semibold text-gray-800">{formatBRL(total)}</span>
            </div>
            {linhas.some((l) => l.ehForecast) && (
              <p className="text-[11px] text-gray-400 pt-1">Em itálico: previsão (média histórica), ainda não é faturamento real.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
