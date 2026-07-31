'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { FluxoMensalResultado } from '@/lib/financeiro-fluxo-mensal'
import { formatBRL } from '@/lib/ofx'

interface Props {
  dados: FluxoMensalResultado
  diaIndex: number
  anchorRect: DOMRect
  onClose: () => void
}

const LARGURA = 260
const MARGEM = 8

// Popover de navegação da linha Saldo Acumulado — clique num dia (ou no
// Total, que é o saldo acumulado do último dia) mostra como aquele número
// foi construído: saldo inicial do mês + entradas − saídas acumuladas até
// ali. Tudo já vem em `dados` (sem fetch próprio, ao contrário do popover
// de Faturamento) — mesmo padrão de posicionamento sem lib.
export default function FluxoSaldoPopover({ dados, diaIndex, anchorRect, onClose }: Props) {
  const [pronto, setPronto] = useState(false)
  const [pos, setPos] = useState({ top: anchorRect.bottom + 4, left: anchorRect.left })
  const ref = useRef<HTMLDivElement>(null)

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
  }, [anchorRect])

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

  const dia = dados.dias[diaIndex]
  const titulo = new Date(dia + 'T00:00:00').toLocaleDateString('pt-BR')
  const ehUltimoDia = diaIndex === dados.dias.length - 1

  const entradasAcumuladas = dados.entradasCaixaPorDia.slice(0, diaIndex + 1).reduce((s: number, v) => s + (v || 0), 0)
  const saidasAcumuladas = dados.saidasPorDia.slice(0, diaIndex + 1).reduce((s, v) => s + v, 0)
  const saldoAcumulado = dados.saldoAcumuladoPorDia[diaIndex]

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: LARGURA, visibility: pronto ? 'visible' : 'hidden' }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-800">Saldo Acumulado</p>
          <p className="text-xs text-gray-500">{titulo}{ehUltimoDia && ' · fim do mês'}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Saldo inicial do mês</span>
          <span className={`font-medium ${dados.saldoInicial == null ? 'text-amber-600' : 'text-gray-800'}`}>
            {dados.saldoInicial != null ? formatBRL(dados.saldoInicial) : 'não informado'}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">+ Entradas de Caixa (até o dia)</span>
          <span className="font-medium text-green-600">{formatBRL(entradasAcumuladas)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">− Saídas (até o dia)</span>
          <span className="font-medium text-red-600">{formatBRL(saidasAcumuladas)}</span>
        </div>
        <div className="flex items-center justify-between text-sm pt-1.5 border-t border-gray-100">
          <span className="font-semibold text-gray-700">Saldo Acumulado</span>
          <span className="font-semibold text-gray-800">{saldoAcumulado != null ? formatBRL(saldoAcumulado) : '—'}</span>
        </div>
        {dados.saldoInicial == null && (
          <p className="text-[11px] text-amber-600 pt-1">Sem saldo inicial informado — a conta acima considera 0 como ponto de partida.</p>
        )}
      </div>
    </div>
  )
}
