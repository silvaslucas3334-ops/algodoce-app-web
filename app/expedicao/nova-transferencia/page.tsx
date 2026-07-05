'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowLeft, ArrowRightLeft } from 'lucide-react'

export default function NovaTransferenciaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [destino, setDestino] = useState('cozinha')

  // Se não é loja, redirecionar
  useEffect(() => {
    if (usuario && usuario.role !== 'loja') {
      router.push('/expedicao')
    }
  }, [usuario, router])

  function avancar() {
    router.push(`/expedicao/nova-transferencia/${destino}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ArrowRightLeft size={28} />
            Nova Transferência
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">
              📍 Destino da Transferência
            </label>
            <select
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="cozinha">Cozinha</option>
              <option value="loja1">Paraisópolis</option>
              <option value="loja2">Itajubá</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Selecione para onde deseja devolver/transferir os produtos
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={avancar}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
            >
              Próximo: Selecionar Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
