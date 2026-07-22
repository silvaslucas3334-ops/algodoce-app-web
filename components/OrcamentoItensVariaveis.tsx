'use client'
import { useState } from 'react'
import { formatBRL } from '@/lib/ofx'
import { FinanceiroParte, FinanceiroConta } from '@/lib/types'
import { Plus, Trash2 } from 'lucide-react'

export interface ItemOrcamentoVariavel {
  tipo: 'despesa' | 'compra_insumos'
  id: string // parte_id ou conta_id
  nome: string
  valor_previsto: number
}

interface Props {
  itens: ItemOrcamentoVariavel[]
  onChange: (itens: ItemOrcamentoVariavel[]) => void
  fornecedores: FinanceiroParte[]
  contas: FinanceiroConta[]
  readOnly?: boolean
}

/**
 * Previsão manual de despesas variáveis (insumos, embalagens, despesas
 * diversas) — por fornecedor (compra_insumos) ou por conta, pra alocações
 * gerais sem fornecedor específico (ex: distribuição de lucro/pró-labore).
 * As duas formas cobrem casos diferentes, nenhuma substitui a outra.
 */
export default function OrcamentoItensVariaveis({ itens, onChange, fornecedores, contas, readOnly }: Props) {
  const [novoModo, setNovoModo] = useState<'despesa' | 'compra_insumos'>('compra_insumos')
  const [novoId, setNovoId] = useState('')
  const [novoValor, setNovoValor] = useState('')

  function adicionarItem() {
    if (!novoId || Number(novoValor) <= 0) return
    const nome = novoModo === 'despesa' ? contas.find((c) => c.id === novoId)?.nome : fornecedores.find((f) => f.id === novoId)?.nome
    onChange([...itens, { tipo: novoModo, id: novoId, nome: nome || '—', valor_previsto: Number(novoValor) }])
    setNovoId('')
    setNovoValor('')
  }

  function removerItem(indice: number) {
    onChange(itens.filter((_, i) => i !== indice))
  }

  const total = itens.reduce((s, i) => s + i.valor_previsto, 0)

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">Despesas variáveis previstas (consolidado) — {formatBRL(total)}</p>
      {itens.length > 0 && (
        <div className="space-y-1 mb-3">
          {itens.map((item, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-700">
                {item.nome}
                <span className="ml-1.5 text-[10px] font-semibold text-gray-400">{item.tipo === 'despesa' ? 'conta' : 'fornecedor'}</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800">{formatBRL(item.valor_previsto)}</span>
                {!readOnly && (
                  <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setNovoModo('compra_insumos'); setNovoId('') }}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${novoModo === 'compra_insumos' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              Fornecedor
            </button>
            <button
              type="button"
              onClick={() => { setNovoModo('despesa'); setNovoId('') }}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${novoModo === 'despesa' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              Conta (alocação geral)
            </button>
          </div>
          <select value={novoId} onChange={(e) => setNovoId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Selecione...</option>
            {novoModo === 'despesa'
              ? contas.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)
              : fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" min={0} value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
              placeholder="Valor previsto (R$)" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={adicionarItem}
              disabled={!novoId || Number(novoValor) <= 0}
              className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
