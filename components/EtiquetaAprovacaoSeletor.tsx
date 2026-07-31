'use client'
import { useEffect, useRef, useState } from 'react'
import { EtiquetaAprovacao } from '@/lib/types'
import { ETIQUETA_APROVACAO_LABEL, ETIQUETA_APROVACAO_COLOR } from '@/lib/constants'

interface Props {
  valor: EtiquetaAprovacao | null | undefined
  onChange: (novo: EtiquetaAprovacao | null) => void
}

const OPCOES: (EtiquetaAprovacao | null)[] = [null, 'planejar_pagamento', 'aprovada_pagamento']

// Pill clicável pra comunicar entre admins qual despesa está pronta pra
// pagar vs. ainda precisa ser planejada — recado rápido, sem abrir a
// despesa. Mesmo padrão de overlay (fecha ao clicar fora) de
// components/NotificacoesPainel.tsx.
export default function EtiquetaAprovacaoSeletor({ valor, onChange }: Props) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function escolher(opcao: EtiquetaAprovacao | null) {
    setAberto(false)
    if (opcao !== valor) onChange(opcao)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setAberto((v) => !v)
        }}
        className={
          valor
            ? `text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${ETIQUETA_APROVACAO_COLOR[valor]}`
            : 'text-[11px] text-gray-400 hover:text-gray-600 whitespace-nowrap'
        }
      >
        {valor ? ETIQUETA_APROVACAO_LABEL[valor] : '+ etiqueta'}
      </button>

      {aberto && (
        <div className="absolute right-0 z-50 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {OPCOES.map((opcao) => (
            <button
              key={opcao || 'nenhuma'}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                escolher(opcao)
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                opcao === valor ? 'font-semibold text-gray-800' : 'text-gray-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${opcao ? ETIQUETA_APROVACAO_COLOR[opcao].split(' ')[0] : 'bg-gray-200'}`} />
              {opcao ? ETIQUETA_APROVACAO_LABEL[opcao] : 'Sem etiqueta'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
