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
  dataEspecifica: string | null // AAAA-MM-DD; previsão pontual numa data exata — no máximo um entre diaSemana/dataEspecifica
}

interface Props {
  itens: ItemOrcamentoVariavel[]
  onChange: (itens: ItemOrcamentoVariavel[]) => void
  fornecedores: FinanceiroParte[]
  contas: FinanceiroConta[]
  dias: string[] // dias do mês sendo editado — usado pra calcular o total mensal e limitar a data específica
  readOnly?: boolean
}

const DIA_SEMANA_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

type ModoQuando = 'sem_padrao' | 'dia_semana' | 'data_especifica'

/**
 * Previsão manual de despesas variáveis (insumos, embalagens, despesas
 * diversas) — por fornecedor (compra_insumos) ou por conta, pra alocações
 * gerais sem fornecedor específico (ex: distribuição de lucro/pró-labore).
 * As duas formas cobrem casos diferentes, nenhuma substitui a outra.
 *
 * Cada item tem um "quando" opcional: sem padrão (valor único do mês,
 * só entra na comparação orçado x realizado), por dia da semana (ex:
 * fornecedor pago toda segunda — valor "por ocorrência", projeta nos
 * dias futuros do calendário) ou numa data específica (ex: retirada de
 * lucro no dia 25 — previsão pontual, também projeta no calendário). A
 * previsão por dia da semana/data específica some sozinha quando o dia
 * passa ou quando já existe um lançamento real na mesma data.
 */
export default function OrcamentoItensVariaveis({ itens, onChange, fornecedores, contas, dias, readOnly }: Props) {
  const [novoModo, setNovoModo] = useState<'despesa' | 'compra_insumos'>('compra_insumos')
  const [novoId, setNovoId] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const [novoQuando, setNovoQuando] = useState<ModoQuando>('sem_padrao')
  const [novoDiaSemana, setNovoDiaSemana] = useState('0')
  const [novoDataEspecifica, setNovoDataEspecifica] = useState('')

  const primeiroDia = dias[0]
  const ultimoDia = dias[dias.length - 1]

  function adicionarItem() {
    if (!novoId || Number(novoValor) <= 0) return
    if (novoQuando === 'data_especifica' && !novoDataEspecifica) return
    const nome = novoModo === 'despesa' ? contas.find((c) => c.id === novoId)?.nome : fornecedores.find((f) => f.id === novoId)?.nome
    onChange([
      ...itens,
      {
        tipo: novoModo,
        id: novoId,
        nome: nome || '—',
        valor_previsto: Number(novoValor),
        diaSemana: novoQuando === 'dia_semana' ? Number(novoDiaSemana) : null,
        dataEspecifica: novoQuando === 'data_especifica' ? novoDataEspecifica : null,
      },
    ])
    setNovoId('')
    setNovoValor('')
    setNovoQuando('sem_padrao')
    setNovoDiaSemana('0')
    setNovoDataEspecifica('')
  }

  function removerItem(indice: number) {
    onChange(itens.filter((_, i) => i !== indice))
  }

  const total = itens.reduce(
    (s, i) => s + valorMensalItemOrcamento({ valor_previsto: i.valor_previsto, dia_semana: i.diaSemana }, dias),
    0
  )

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
                {item.dataEspecifica && (
                  <span className="block text-[10px] text-purple-600">dia {new Date(item.dataEspecifica + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                )}
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNovoQuando('sem_padrao')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 ${novoQuando === 'sem_padrao' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              Valor único do mês
            </button>
            <button
              type="button"
              onClick={() => setNovoQuando('dia_semana')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 ${novoQuando === 'dia_semana' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              Toda [dia da semana]
            </button>
            <button
              type="button"
              onClick={() => setNovoQuando('data_especifica')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border-2 ${novoQuando === 'data_especifica' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              Numa data
            </button>
          </div>

          {novoQuando === 'dia_semana' && (
            <select value={novoDiaSemana} onChange={(e) => setNovoDiaSemana(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {DIA_SEMANA_LABEL.map((label, i) => (
                <option key={i} value={i}>Toda {label}</option>
              ))}
            </select>
          )}
          {novoQuando === 'data_especifica' && (
            <input
              type="date" value={novoDataEspecifica} min={primeiroDia} max={ultimoDia}
              onChange={(e) => setNovoDataEspecifica(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          )}

          <div className="flex gap-2">
            <input
              type="number" step="0.01" min={0} value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
              placeholder={novoQuando === 'dia_semana' ? 'Valor por ocorrência (R$)' : 'Valor previsto (R$)'} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={adicionarItem}
              disabled={!novoId || Number(novoValor) <= 0 || (novoQuando === 'data_especifica' && !novoDataEspecifica)}
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
