'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, LucideIcon } from 'lucide-react'

export interface SecaoCardExpansivel {
  titulo?: string
  cor: 'red' | 'amber' | 'gray'
  total: number
  itens: { label: string; sublabel: string }[]
  textoVazio: string
}

interface CardExpansivelProps {
  titulo: string
  Icone: LucideIcon
  cor: 'red' | 'amber' | 'gray'
  totalBadge: number
  secoes: SecaoCardExpansivel[]
  hrefVerTodos: string
}

const CORES: Record<'red' | 'amber' | 'gray', { bg: string; border: string; text: string; badge: string; subtitulo: string }> = {
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-200 text-red-700', subtitulo: 'text-red-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-700', subtitulo: 'text-amber-600' },
  gray: { bg: 'bg-white', border: 'border-gray-200', text: 'text-gray-800', badge: 'bg-gray-200 text-gray-700', subtitulo: 'text-gray-500' },
}

const MAX_ITENS = 5

// Card com header sempre visível (título + badge com o total) que expande
// inline pra mostrar até 5 itens por seção — sem overlay, pensado pra caber
// dentro do fluxo normal do painel (ver plano: nenhum componente de
// accordion reaproveitável existia antes disso).
export default function CardExpansivel({ titulo, Icone, cor, totalBadge, secoes, hrefVerTodos }: CardExpansivelProps) {
  const [aberto, setAberto] = useState(false)
  const c = CORES[cor]

  if (totalBadge === 0) return null

  return (
    <div className={`${c.bg} border ${c.border} rounded-xl overflow-hidden`}>
      <button onClick={() => setAberto((v) => !v)} className="w-full p-4 flex items-center justify-between text-left">
        <span className={`flex items-center gap-2 font-semibold text-sm ${c.text}`}>
          <Icone size={18} />
          {titulo}
        </span>
        <span className="flex items-center gap-2">
          <span className={`${c.badge} px-3 py-1 rounded-full text-sm font-bold`}>{totalBadge}</span>
          <ChevronDown size={18} className={`${c.text} transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-3">
          {secoes.map((secao, i) => (
            <div key={i}>
              {secao.titulo && (
                <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${CORES[secao.cor].subtitulo}`}>
                  {secao.titulo} ({secao.total})
                </p>
              )}
              {secao.total === 0 ? (
                <p className="text-xs text-gray-400">{secao.textoVazio}</p>
              ) : (
                <div className="space-y-1.5">
                  {secao.itens.slice(0, MAX_ITENS).map((item, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700 truncate">{item.label}</span>
                      <span className="text-gray-500 text-xs whitespace-nowrap">{item.sublabel}</span>
                    </div>
                  ))}
                  {secao.total > MAX_ITENS && (
                    <Link href={hrefVerTodos} className={`text-xs font-semibold ${c.text} inline-block pt-1`}>
                      Ver todos ({secao.total}) →
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
