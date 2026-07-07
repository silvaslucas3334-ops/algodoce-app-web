'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar } from 'lucide-react'

export default function NovoRomaneioPage() {
  const router = useRouter()

  const [dataEntrega, setDataEntrega] = useState('')
  const [unidadeDestino, setUnidadeDestino] = useState('loja1')

  // Data mínima = hoje
  const hoje = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Novo Romaneio</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Step 1: Seleção de Data + Unidade */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar size={18} />
              Data de Entrega
            </label>
            <input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
              min={hoje}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              📍 Unidade de Destino
            </label>
            <select
              value={unidadeDestino}
              onChange={(e) => setUnidadeDestino(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="loja1">Paraisópolis</option>
              <option value="loja2">Itajubá</option>
            </select>
          </div>

          {dataEntrega && (
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={() => router.back()}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => router.push(`/expedicao/novo/${dataEntrega}/${unidadeDestino}`)}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
              >
                Próximo: Verificar Pedidos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
