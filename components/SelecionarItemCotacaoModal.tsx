'use client'
import { useState } from 'react'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { X, Search, ArrowLeft, Plus } from 'lucide-react'

export interface ItemCotacaoForm {
  materia_prima_id: string
  materia_prima_nome: string
  quantidade: number
  unidade_cotacao: string
  observacao?: string
}

interface Props {
  materias: FinanceiroMateriaPrima[]
  onAdd: (item: ItemCotacaoForm) => void
  onClose: () => void
}

// Versão simplificada de SelecionarMateriaPrimaModal — sem preço, sem
// fator de conversão da nota: nesse momento ainda não existe preço
// nenhum, só a lista do que vai ser cotado.
export default function SelecionarItemCotacaoModal({ materias, onAdd, onClose }: Props) {
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<FinanceiroMateriaPrima | null>(null)
  const [quantidade, setQuantidade] = useState('')
  const [observacao, setObservacao] = useState('')

  const filtradas = materias.filter((m) =>
    m.nome.toLowerCase().includes(busca.trim().toLowerCase()) ||
    (m.descricao || '').toLowerCase().includes(busca.trim().toLowerCase())
  )

  function escolher(m: FinanceiroMateriaPrima) {
    setSelecionada(m)
    setQuantidade('')
    setObservacao('')
  }

  const itemValido = selecionada && Number(quantidade) > 0

  function adicionar() {
    if (!itemValido || !selecionada) return
    onAdd({
      materia_prima_id: selecionada.id,
      materia_prima_nome: selecionada.nome,
      quantidade: Number(quantidade),
      unidade_cotacao: selecionada.unidade_compra,
      observacao: observacao.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {selecionada && (
              <button onClick={() => setSelecionada(null)} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={20} />
              </button>
            )}
            <h3 className="text-lg font-bold text-gray-800">
              {selecionada ? selecionada.nome : 'Selecionar item da cotação'}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {!selecionada ? (
          <>
            <div className="relative mb-3">
              <Search size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                autoFocus
                placeholder="Pesquisar pela descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
              />
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Nenhuma matéria-prima encontrada{busca ? ` para "${busca}"` : ''} — peça ao admin para cadastrar.
                </p>
              ) : (
                filtradas.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => escolher(m)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-800 border border-gray-200"
                  >
                    <p className="font-medium">{m.nome}</p>
                    <p className="text-xs text-gray-500">Compra em {m.unidade_compra} · usa em {m.unidade_medida}</p>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantidade a cotar ({selecionada.unidade_compra})
              </label>
              <input
                type="number"
                step="any"
                min={0}
                autoFocus
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observação (opcional)</label>
              <input
                type="text"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: marca preferencial, especificação..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>

            <button
              onClick={adicionar}
              disabled={!itemValido}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Adicionar à cotação
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
