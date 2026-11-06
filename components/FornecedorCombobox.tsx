'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export interface OpcaoFornecedor {
  id: string
  nome: string
}

interface Props {
  valorId: string // '' = nenhum
  opcoes: OpcaoFornecedor[]
  onChange: (id: string) => void
  placeholder?: string
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Busca de fornecedor com digitação (a lista real passa de dezenas de nomes,
// ruim de percorrer num <select>). Sem dependência: input + lista filtrada.
export default function FornecedorCombobox({ valorId, opcoes, onChange, placeholder = 'Filtrar por fornecedor...' }: Props) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  const selecionado = opcoes.find((o) => o.id === valorId)

  const sugestoes = useMemo(() => {
    const termo = semAcento(texto.trim())
    const lista = termo ? opcoes.filter((o) => semAcento(o.nome).includes(termo)) : opcoes
    return lista.slice(0, 8)
  }, [texto, opcoes])

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  if (valorId) {
    return (
      <div className="inline-flex items-center gap-1.5 bg-gray-800 text-white text-sm font-semibold rounded-full pl-3 pr-1.5 py-1 max-w-full">
        <span className="truncate">{selecionado?.nome || 'Fornecedor'}</span>
        <button
          type="button"
          onClick={() => { onChange(''); setTexto('') }}
          className="rounded-full p-0.5 hover:bg-gray-600"
          aria-label="Remover filtro de fornecedor"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div ref={raiz} className="relative w-full sm:w-72">
      <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
      <input
        type="text"
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAberto(true) }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAberto(false)
          if (e.key === 'Enter' && sugestoes.length > 0) {
            e.preventDefault()
            onChange(sugestoes[0].id)
            setAberto(false)
            setTexto('')
          }
        }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm bg-white"
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {sugestoes.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => { onChange(o.id); setAberto(false); setTexto('') }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-pink-50"
              >
                {o.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
