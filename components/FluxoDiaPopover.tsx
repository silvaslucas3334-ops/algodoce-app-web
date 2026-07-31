'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import {
  buscarLancamentosDoDiaSaida,
  LancamentoDoDiaSaida,
  VisaoFluxoMensal,
} from '@/lib/financeiro-fluxo-mensal'
import { formatBRL } from '@/lib/ofx'

interface Props {
  dia: string
  tituloGrupo: string
  origem: 'conta' | 'parte'
  grupoId: string
  unidade: VisaoFluxoMensal
  valorCelula: number
  anchorRect: DOMRect
  onClose: () => void
}

const LARGURA = 300
const MARGEM = 8

// Popover ancorado na célula clicada, em vez do modal antigo que mostrava
// o mês inteiro da linha — precisa sair da tela pra conferir um
// lançamento específico. Sem lib de posicionamento (nenhuma instalada no
// projeto): mede o próprio tamanho antes de exibir, clampa nas bordas da
// viewport.
export default function FluxoDiaPopover({ dia, tituloGrupo, origem, grupoId, unidade, valorCelula, anchorRect, onClose }: Props) {
  const [lancamentos, setLancamentos] = useState<LancamentoDoDiaSaida[] | null>(null)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [pos, setPos] = useState({ top: anchorRect.bottom + 4, left: anchorRect.left })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelado = false
    buscarLancamentosDoDiaSaida(unidade, dia, origem, grupoId)
      .then((data) => { if (!cancelado) setLancamentos(data) })
      .catch((err) => { if (!cancelado) setErro('Erro ao carregar: ' + (err?.message || 'desconhecido')) })
    return () => { cancelado = true }
  }, [unidade, dia, origem, grupoId])

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
  }, [anchorRect, lancamentos, erro])

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

  const dataFormatada = new Date(dia + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: LARGURA, visibility: pronto ? 'visible' : 'hidden' }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-gray-100">
        <div>
          <p className="text-sm font-semibold text-gray-800">{tituloGrupo}</p>
          <p className="text-xs text-gray-500">{dataFormatada}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X size={16} />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-2">
        {erro && <p className="text-xs text-red-600 p-2">{erro}</p>}

        {!erro && lancamentos === null && <p className="text-xs text-gray-400 text-center py-3">Carregando...</p>}

        {!erro && lancamentos && lancamentos.length === 0 && (
          <p className="text-xs text-gray-500 p-2">
            Sem lançamento registrado ainda — {formatBRL(Math.abs(valorCelula))} é previsão (orçamento/recorrência), não lançamento real.
          </p>
        )}

        {!erro && lancamentos && lancamentos.length > 0 && (
          <div className="space-y-1">
            {lancamentos.map((l) => (
              <Link
                key={l.id}
                href={`/financeiro/despesas/${l.id}`}
                className="block p-2 rounded-lg hover:bg-gray-50 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-800 truncate">{l.descricao}</span>
                  <span className="font-medium text-gray-800 whitespace-nowrap">{formatBRL(l.valor_total)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span className="truncate">{l.parte_nome}</span>
                  <span className={l.status === 'pago' ? 'text-green-600' : 'text-amber-600'}>
                    {l.status === 'pago' ? 'Pago' : 'Em aberto'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
