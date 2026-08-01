'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'
import { hojeISO } from '@/lib/financeiro-utils'

interface Props {
  id: string
  descricao: string
  valorAtual: number
  vencimentoAtual: string
  // Link pra tela completa (parcelamento, etiqueta, itens de insumo,
  // conciliação) — sempre com voltarPara já embutido, pra "voltar"
  // retornar pro wizard em vez do default (lista de Despesas).
  detalheHref: string
  onClose: () => void
  onSalvo: () => void
}

// Edição rápida sem sair do wizard — pensada pro caso mais comum aqui:
// "essa conta a gente sempre paga atrasado", corrigir status/data/valor
// direto na lista de Despesas Fixas. Qualquer outra coisa (parcelamento,
// etiqueta, itens) continua na tela completa, via o link no rodapé.
export default function DespesaFixaQuickEditModal({ id, descricao, valorAtual, vencimentoAtual, detalheHref, onClose, onSalvo }: Props) {
  const [pago, setPago] = useState(false)
  const [data, setData] = useState(vencimentoAtual)
  const [valor, setValor] = useState(String(valorAtual))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function marcarPaga() {
    setPago(true)
    // Sugere hoje, mas o campo continua editável — a conta pode já ter
    // sido paga num dia diferente (esse é o caso que motivou o modal).
    if (data === vencimentoAtual) setData(hojeISO())
  }

  function voltarParaAberto() {
    setPago(false)
    setData(vencimentoAtual)
  }

  async function salvar() {
    const valorNum = Number(valor)
    if (!valorNum || valorNum <= 0) {
      setErro('Informe um valor válido.')
      return
    }
    if (!data) {
      setErro('Informe a data.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const payload: Record<string, any> = { valor_total: valorNum, updated_at: new Date().toISOString() }
      if (pago) {
        payload.status = 'pago'
        payload.data_pagamento = data
      } else {
        payload.data_vencimento = data
      }
      const { error } = await supabase.from('financeiro_lancamentos').update(payload).eq('id', id)
      if (error) throw error
      onSalvo()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-800 truncate">{descricao}</h3>
            <p className="text-xs text-gray-400">Ajuste rápido, sem sair do orçamento</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700 mb-3">{erro}</div>}

        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={voltarParaAberto}
              className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-semibold ${
                !pago ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              Em aberto
            </button>
            <button
              type="button"
              onClick={marcarPaga}
              className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-semibold ${
                pago ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'
              }`}
            >
              Já foi paga
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{pago ? 'Data em que foi paga' : 'Data de vencimento'}</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Valor</label>
            <input
              type="number"
              step="0.01"
              min={0}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>

          <Link href={detalheHref} className="block text-center text-xs text-gray-500 hover:text-gray-700 underline">
            Ver detalhes completos (parcelamento, etiqueta...)
          </Link>
        </div>
      </div>
    </div>
  )
}
