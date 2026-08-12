'use client'
import { useEffect, useState } from 'react'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import NovaMateriaPrimaRapidaModal from '@/components/NovaMateriaPrimaRapidaModal'
import { X, Search, ArrowLeft, Plus } from 'lucide-react'

export interface ItemNota {
  materia_prima_id: string
  materia_prima_nome: string
  quantidade: number
  unidade_nota: string
  fator_conversao: number // unidade_medida por 1 unidade_nota
  valor_unitario: number
  valor_total: number
  conta_id: string | null
  conta_label: string | null
}

interface Props {
  materias: FinanceiroMateriaPrima[]
  itemInicial?: ItemNota // presente = editar item já existente, pula a busca e pré-popula os valores
  onAdd: (item: ItemNota) => void
  onClose: () => void
  // Opcional: quando presente, mostra "+ Cadastrar matéria-prima" na busca —
  // sem essa prop, comportamento idêntico ao de antes (nenhum caller quebra).
  onMateriaPrimaCriada?: (m: FinanceiroMateriaPrima) => void
}

export default function SelecionarMateriaPrimaModal({ materias, itemInicial, onAdd, onClose, onMateriaPrimaCriada }: Props) {
  const editando = !!itemInicial
  const [busca, setBusca] = useState('')
  const [modalNovaMateria, setModalNovaMateria] = useState(false)
  const [selecionada, setSelecionada] = useState<FinanceiroMateriaPrima | null>(
    itemInicial ? materias.find((m) => m.id === itemInicial.materia_prima_id) || null : null
  )

  const [quantidade, setQuantidade] = useState(itemInicial ? String(itemInicial.quantidade) : '')
  const [unidadeNota, setUnidadeNota] = useState(itemInicial?.unidade_nota || '')
  const [fatorConversao, setFatorConversao] = useState(itemInicial ? String(itemInicial.fator_conversao) : '')
  const [valorUnitario, setValorUnitario] = useState(itemInicial ? String(itemInicial.valor_unitario) : '')
  const [valorTotal, setValorTotal] = useState(itemInicial ? String(itemInicial.valor_total) : '')

  const filtradas = materias.filter((m) =>
    m.nome.toLowerCase().includes(busca.trim().toLowerCase()) ||
    (m.descricao || '').toLowerCase().includes(busca.trim().toLowerCase())
  )

  // A unidade da nota pode diferir da unidade de compra cadastrada (ex:
  // cadastro em kg, NF vendendo por caixa). Quando bate, o fator vem do
  // cadastro; quando difere, o usuário informa a conversão desta nota.
  const unidadeBateComCadastro = selecionada && unidadeNota.trim().toLowerCase() === selecionada.unidade_compra.trim().toLowerCase()

  useEffect(() => {
    if (!selecionada) return
    if (unidadeBateComCadastro) {
      setFatorConversao(String(selecionada.fator_conversao))
    }
  }, [unidadeNota, selecionada, unidadeBateComCadastro])

  // Valor total nunca é digitado — sempre o resultado de quantidade ×
  // valor unitário, pra nunca ficar dessincronizado do que o usuário vê
  // nesses dois campos (era exatamente esse descompasso que gerava
  // lançamento errado: o campo ficava travado em "editado manualmente"
  // assim que se abria um item existente pra editar, e uma correção no
  // valor unitário não refletia no total).
  useEffect(() => {
    setValorTotal(quantidade && valorUnitario ? (Number(quantidade) * Number(valorUnitario)).toFixed(2) : '')
  }, [quantidade, valorUnitario])

  function escolher(m: FinanceiroMateriaPrima) {
    setSelecionada(m)
    setUnidadeNota(m.unidade_compra)
    setFatorConversao(String(m.fator_conversao))
    setQuantidade('')
    setValorUnitario('')
    setValorTotal('')
  }

  const itemValido =
    selecionada && Number(quantidade) > 0 && unidadeNota.trim() && Number(fatorConversao) > 0 && Number(valorTotal) >= 0

  function adicionar() {
    if (!itemValido || !selecionada) return
    onAdd({
      materia_prima_id: selecionada.id,
      materia_prima_nome: selecionada.nome,
      quantidade: Number(quantidade),
      unidade_nota: unidadeNota.trim(),
      fator_conversao: Number(fatorConversao),
      valor_unitario: Number(valorUnitario) || 0,
      valor_total: Number(valorTotal),
      conta_id: selecionada.conta_id || null,
      conta_label: selecionada.conta ? `${selecionada.conta.codigo} — ${selecionada.conta.nome}` : null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {selecionada && !editando && (
              <button onClick={() => setSelecionada(null)} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={20} />
              </button>
            )}
            <h3 className="text-lg font-bold text-gray-800">
              {selecionada ? selecionada.nome : 'Selecionar item da nota'}
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
            {onMateriaPrimaCriada && (
              <button
                type="button"
                onClick={() => setModalNovaMateria(true)}
                className="text-xs font-medium text-pink-700 hover:text-pink-800 mb-2"
              >
                + Cadastrar matéria-prima
              </button>
            )}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtradas.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Nenhuma matéria-prima encontrada{busca ? ` para "${busca}"` : ''}.
                </p>
              ) : (
                filtradas.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => escolher(m)}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-800 border border-gray-200"
                  >
                    <p className="font-medium">{m.nome}</p>
                    <p className="text-xs text-gray-500">
                      Compra em {m.unidade_compra} · usa em {m.unidade_medida}
                      {m.conta ? ` · ${m.conta.codigo} ${m.conta.nome}` : ''}
                    </p>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Quantidade</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade na nota</label>
                <input
                  type="text"
                  value={unidadeNota}
                  onChange={(e) => setUnidadeNota(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder={selecionada.unidade_compra}
                />
                <p className="text-xs text-gray-400 mt-1">Como está impressa na NF (CX, KG, UN...)</p>
              </div>
            </div>

            {!unidadeBateComCadastro && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-sm font-medium text-amber-800 mb-2">
                  Conversão: quantas {selecionada.unidade_medida} tem 1 {unidadeNota.trim() || 'unidade da nota'}?
                </label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={fatorConversao}
                  onChange={(e) => setFatorConversao(e.target.value)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2.5 text-sm"
                />
                <p className="text-xs text-amber-700 mt-1">
                  A unidade da nota difere do cadastro ({selecionada.unidade_compra}) — informe a conversão para o custo sair certo.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor unitário (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={valorUnitario}
                  onChange={(e) => setValorUnitario(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor total (R$)</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-600">
                  {valorTotal ? formatBRL(Number(valorTotal)) : '—'}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Valor total = quantidade × valor unitário — calculado automaticamente, não dá pra digitar direto.
            </p>

            {Number(quantidade) > 0 && Number(valorTotal) > 0 && Number(fatorConversao) > 0 && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2">
                Custo resultante: {formatBRL(Number(valorTotal) / (Number(quantidade) * Number(fatorConversao)))} por {selecionada.unidade_medida}
              </p>
            )}

            <button
              onClick={adicionar}
              disabled={!itemValido}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {editando ? 'Salvar alterações' : (<><Plus size={16} /> Adicionar à nota</>)}
            </button>
          </div>
        )}
      </div>

      {modalNovaMateria && (
        <NovaMateriaPrimaRapidaModal
          onClose={() => setModalNovaMateria(false)}
          onCreated={(nova) => {
            onMateriaPrimaCriada?.(nova)
            escolher(nova)
          }}
        />
      )}
    </div>
  )
}
