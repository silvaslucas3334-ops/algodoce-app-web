'use client'
import { formatBRL } from '@/lib/ofx'
import { X } from 'lucide-react'

export interface LinhaDrilldown {
  label: string
  valor: number
}

interface Props {
  titulo: string
  linhas: LinhaDrilldown[]
  onClose: () => void
}

// Modal genérico de detalhe — usado tanto pro dia-a-dia de uma conta/
// fornecedor (linha a linha) quanto pra categoria de entradas de caixa do
// mês (mesma forma { label, valor }, sem precisar de dois componentes).
export default function FluxoMensalDrilldownModal({ titulo, linhas, onClose }: Props) {
  const linhasComValor = linhas.filter((l) => l.valor !== 0)
  const total = linhasComValor.reduce((s, l) => s + l.valor, 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {linhasComValor.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Nada neste período.</p>
        ) : (
          <div className="space-y-1">
            {linhasComValor.map((l, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <span className="text-gray-700">{l.label}</span>
                <span className="font-semibold text-gray-800">{formatBRL(l.valor)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center px-3 pt-3 border-t border-gray-200 text-sm">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">{formatBRL(total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
