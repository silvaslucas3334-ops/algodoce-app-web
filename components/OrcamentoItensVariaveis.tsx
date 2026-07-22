'use client'
import { useState } from 'react'
import { formatBRL } from '@/lib/ofx'
import { FinanceiroParte, FinanceiroConta } from '@/lib/types'
import { valorMensalItemOrcamento } from '@/lib/financeiro-fluxo-mensal'
import { Plus, Trash2 } from 'lucide-react'

export interface ItemOrcamentoVariavel {
  tipo: 'despesa' | 'compra_insumos'
  id: string // parte_id ou conta_id
  nome: string
  valor_previsto: number
  diaSemana: number | null // 0=domingo..6=sábado; presente = valor_previsto é "por ocorrência" (ex: toda segunda)
}

interface Props {
  itens: ItemOrcamentoVariavel[]
  onChange: (itens: ItemOrcamentoVariavel[]) => void
  fornecedores: FinanceiroParte[]
  contas: FinanceiroConta[]
  dias: string[] // dias do mês sendo editado — usado só pra calcular o total mensal de itens "por dia da semana"
  readOnly?: boolean
}

const DIA_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/**
 * Previsão manual de despesas variáveis (insumos, embalagens, despesas
 * diversas) — por fornecedor (compra_insumos) ou por conta, pra alocações
 * gerais sem fornecedor específico (ex: distribuição de lucro/pró-labore).
 * As duas formas cobrem casos diferentes, nenhuma substitui a outra.
 *
 * Cada item pode opcionalmente ter um dia da semana — pra fornecedores com
 * padrão semanal previsível (ex: boleto pago toda segunda), o valor vira
 * "por ocorrência" e o total do mês é calculado automaticamente. Sem dia
 * da semana, o valor continua sendo um total único pro mês inteiro.
 */
export default function OrcamentoItensVariaveis({ itens, onChange, fornecedores, contas, dias, readOnly }: Props) {
  const [novoModo, setNovoModo] = useState<'despesa' | 'compra_insumos'>('compra_insumos')
  const [novoId, setNovoId] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [novoDiaSemana, setNovoDiaSemana] = useState<string>('')

  function adicionarItem() {
    if (!novoId || Number(novoValor) <= 0) return
    const nome = novoModo === 'despesa' ? contas.find((c) => c.id === novoId)?.nome : fornecedores.find((f) => f.id === novoId)?.nome
    onChange([
      ...itens,
      { tipo: novoModo, id: novoId, nome: nome || '—', valor_previsto: Number(novoValor), diaSemana: novoDiaSemana !== '' ? Number(novoDiaSemana) : null },
    ])
    setNovoId('')
    setNovoValor('')
    setNovoDiaSemana('')
  }

  function removerItem(indice: number) {
    onChange(itens.filter((_, i) => i !== indice))
  }

  const total = itens.reduce((s, i) => s + valorMensalItemOrcamento({ valor_previsto: i.valor_previsto, dia_semana: i.diaSemana }, dias), 0)

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
                {item.diaSemana != null && <span className="block text-[10px] text-purple-600">toda {DIA_SEMANA_LABEL[item.diaSemana]}</span>}
              </span>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <span className="font-semibold text-gray-800">{formatBRL(item.valor_previsto)}</span>
                  {item.diaSemana != null && <span className="block text-[10px] text-gray-400">por ocorrência</span>}
                </div>
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
          <select value={novoDiaSemana} onChange={(e) => setNovoDiaSemana(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">Valor único do mês (sem padrão semanal)</option>
            {DIA_SEMANA_LABEL.map((label, i) => (
              <option key={i} value={i}>Toda {label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" min={0} value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
              placeholder={novoDiaSemana !== '' ? 'Valor por ocorrência (R$)' : 'Valor previsto (R$)'} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
