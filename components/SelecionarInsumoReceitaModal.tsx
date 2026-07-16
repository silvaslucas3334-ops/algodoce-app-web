'use client'
import { useState } from 'react'
import { FinanceiroMateriaPrima, FinanceiroPrePreparo } from '@/lib/types'
import { X, Search, ArrowLeft, Plus } from 'lucide-react'

export interface ItemReceitaForm {
  materia_prima_id: string | null
  pre_preparo_id: string | null
  nome: string
  unidade_medida: string
  quantidade: number
}

interface Opcao {
  tipo: 'materia_prima' | 'pre_preparo'
  id: string
  nome: string
  unidade_medida: string
}

interface Props {
  materias: FinanceiroMateriaPrima[]
  // Se informado, pré-preparos também aparecem como opção (editor de
  // produto final) — se omitido, só matéria-prima é selecionável (editor
  // de pré-preparo, que por regra nunca usa outro pré-preparo).
  prePreparos?: FinanceiroPrePreparo[]
  onAdd: (item: ItemReceitaForm) => void
  onClose: () => void
}

// Irmão mais simples de SelecionarItemCotacaoModal — sem preço, sem
// conversão: a receita é sempre expressa na unidade_medida do próprio
// item (a "unidade da ficha técnica"), nunca na unidade de compra.
export default function SelecionarInsumoReceitaModal({ materias, prePreparos, onAdd, onClose }: Props) {
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<Opcao | null>(null)
  const [quantidade, setQuantidade] = useState('')

  const opcoes: Opcao[] = [
    ...materias.map((m) => ({ tipo: 'materia_prima' as const, id: m.id, nome: m.nome, unidade_medida: m.unidade_medida })),
    ...(prePreparos || []).map((p) => ({ tipo: 'pre_preparo' as const, id: p.id, nome: p.nome, unidade_medida: p.unidade_medida })),
  ]

  const filtradas = opcoes.filter((o) => o.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  function escolher(o: Opcao) {
    setSelecionada(o)
    setQuantidade('')
  }

  const itemValido = selecionada && Number(quantidade) > 0

  function adicionar() {
    if (!itemValido || !selecionada) return
    onAdd({
      materia_prima_id: selecionada.tipo === 'materia_prima' ? selecionada.id : null,
      pre_preparo_id: selecionada.tipo === 'pre_preparo' ? selecionada.id : null,
      nome: selecionada.nome,
      unidade_medida: selecionada.unidade_medida,
      quantidade: Number(quantidade),
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
              {selecionada ? selecionada.nome : 'Selecionar item da receita'}
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
                placeholder="Pesquisar..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
              />
            </div>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Nada encontrado{busca ? ` para "${busca}"` : ''}.
                </p>
              ) : (
                filtradas.map((o) => (
                  <button
                    key={`${o.tipo}-${o.id}`}
                    onClick={() => escolher(o)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-800 border border-gray-200 flex items-center justify-between"
                  >
                    <span>
                      <span className="font-medium">{o.nome}</span>
                      <span className="block text-xs text-gray-500">usa em {o.unidade_medida}</span>
                    </span>
                    {o.tipo === 'pre_preparo' && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 rounded-full px-2 py-0.5 flex-shrink-0">
                        Pré-preparo
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantidade ({selecionada.unidade_medida})
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

            <button
              onClick={adicionar}
              disabled={!itemValido}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Adicionar à receita
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
