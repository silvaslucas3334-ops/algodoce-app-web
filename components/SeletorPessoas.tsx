'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface Pessoa {
  id: string
  nome: string
}

interface SeletorPessoasProps {
  pessoas: Pessoa[]
  selecionados: string[]
  multi?: boolean
  placeholder?: string
  onChange: (ids: string[]) => void
}

// Combobox: campo fechado mostrando a seleção + lista suspensa de coluna
// única pra escolher (sem dividir por grupo/setor — lista únicos poluía a
// tela quando havia setor + gestores). Fecha ao clicar fora; no multi, a
// seleção também aparece como chips removíveis dentro do próprio campo.
export default function SeletorPessoas({ pessoas, selecionados, multi = false, placeholder = 'Selecione...', onChange }: SeletorPessoasProps) {
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  function toggle(id: string) {
    if (multi) {
      onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
    } else {
      onChange([id])
      setAberto(false)
    }
  }

  function remover(id: string) {
    onChange(selecionados.filter((x) => x !== id))
  }

  const pessoasSelecionadas = pessoas.filter((p) => selecionados.includes(p.id))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-left hover:border-gray-400 min-h-[38px]"
      >
        {multi ? (
          pessoasSelecionadas.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {pessoasSelecionadas.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 bg-pink-50 text-pink-800 border border-pink-200 rounded-full pl-2 pr-1 py-0.5 text-xs font-medium"
                >
                  {p.nome}
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      remover(p.id)
                    }}
                    className="hover:bg-pink-200 rounded-full p-0.5"
                  >
                    <X size={10} />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )
        ) : (
          <span className={pessoasSelecionadas[0] ? 'text-gray-800 font-medium' : 'text-gray-400'}>
            {pessoasSelecionadas[0]?.nome || placeholder}
          </span>
        )}
        <ChevronDown size={16} className={`flex-shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>

      {aberto && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto py-1">
          {pessoas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Nenhuma pessoa disponível</p>
          ) : (
            pessoas.map((p) => {
              const ativo = selecionados.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                    ativo ? 'bg-pink-50 text-pink-800 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`w-4 h-4 flex-shrink-0 border-2 ${multi ? 'rounded' : 'rounded-full'} ${
                      ativo ? 'border-pink-600 bg-pink-600' : 'border-gray-300'
                    }`}
                  />
                  {p.nome}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
