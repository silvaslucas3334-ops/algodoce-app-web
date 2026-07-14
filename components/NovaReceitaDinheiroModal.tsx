'use client'
import { useState } from 'react'
import { criarReceitaManualDinheiro } from '@/lib/financeiro-receitas'
import { UNIDADE_LABEL } from '@/lib/constants'
import { X, Save } from 'lucide-react'

interface Props {
  unidadeInicial: 'loja1' | 'loja2'
  usuarioId: string
  onClose: () => void
  onCriada: () => void
}

const HOJE = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

// Venda em dinheiro nunca passa pelo banco — por isso é a única categoria de
// receita lançada manualmente, sem transação de extrato associada.
export default function NovaReceitaDinheiroModal({ unidadeInicial, usuarioId, onClose, onCriada }: Props) {
  const [unidade, setUnidade] = useState<'loja1' | 'loja2'>(unidadeInicial)
  const [data, setData] = useState(HOJE())
  const [valor, setValor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    const valorNum = Number(valor.replace(',', '.'))
    if (!valorNum || valorNum <= 0) {
      setErro('Informe um valor válido')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await criarReceitaManualDinheiro(unidade, data, valorNum, observacao.trim() || null, usuarioId)
      onCriada()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Nova Receita em Dinheiro</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loja</label>
            <div className="flex gap-2">
              {(['loja1', 'loja2'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${
                    unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {UNIDADE_LABEL[u]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
              <input
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full bg-green-600 text-white rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
          >
            <Save size={16} /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
