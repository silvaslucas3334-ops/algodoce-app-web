'use client'
import { useState } from 'react'
import { FinanceiroParte } from '@/lib/types'
import { Search, X } from 'lucide-react'

interface Props {
  fornecedores: FinanceiroParte[]
  selecionados: string[]
  multiplo: boolean
  onAdicionar: (id: string) => void
  onRemover: (id: string) => void
  onCadastrarNovo: () => void
}

/**
 * Busca inline (não modal) pra adicionar fornecedor(es) a uma cotação — em
 * vez de uma grade com todos os fornecedores cadastrados sempre visível
 * (ocupava a tela toda em quem tem muitos cadastrados), só mostra resultados
 * enquanto o usuário digita. multiplo=false esconde a busca depois de um
 * escolhido (cotação tipo 'estimativa', só cabe 1 fornecedor).
 */
export default function SelecionarFornecedorLista({
  fornecedores,
  selecionados,
  multiplo,
  onAdicionar,
  onRemover,
  onCadastrarNovo,
}: Props) {
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()
  const filtrados = termo
    ? fornecedores.filter((f) => !selecionados.includes(f.id) && f.nome.toLowerCase().includes(termo)).slice(0, 8)
    : []

  const mostrarBusca = multiplo || selecionados.length === 0

  return (
    <div className="space-y-2">
      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selecionados.map((id) => {
            const f = fornecedores.find((x) => x.id === id)
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 bg-pink-50 border border-pink-200 text-pink-800 rounded-full pl-3 pr-1.5 py-1 text-sm font-medium"
              >
                {f?.nome || 'Fornecedor'}
                <button type="button" onClick={() => onRemover(id)} className="text-pink-400 hover:text-pink-700">
                  <X size={14} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {mostrarBusca && (
        <>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar fornecedor pelo nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
            />
          </div>
          {termo && (
            <div className="space-y-1">
              {filtrados.length === 0 ? (
                <p className="text-xs text-gray-400 px-1">Nenhum fornecedor encontrado para "{busca}".</p>
              ) : (
                filtrados.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onAdicionar(f.id)
                      setBusca('')
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-800 border border-gray-200"
                  >
                    {f.nome}
                  </button>
                ))
              )}
            </div>
          )}
          {fornecedores.length === 0 && (
            <p className="text-xs text-amber-600">Nenhum fornecedor cadastrado ainda.</p>
          )}
        </>
      )}

      <button type="button" onClick={onCadastrarNovo} className="text-xs font-medium text-pink-700 hover:text-pink-800">
        + Cadastrar novo
      </button>
    </div>
  )
}
