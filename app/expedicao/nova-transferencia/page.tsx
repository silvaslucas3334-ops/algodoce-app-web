'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { ArrowRightLeft } from 'lucide-react'
import { LOCAL_LABEL } from '@/lib/constants'
import { destinosDoMotivo, MotivoTransferencia, MOTIVOS_TRANSFERENCIA, Unidade } from '@/lib/expedicao'

export default function NovaTransferenciaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [motivo, setMotivo] = useState<MotivoTransferencia>('transferencia')
  const [destino, setDestino] = useState<Unidade>('loja1')
  const [origemAdmin, setOrigemAdmin] = useState<'loja1' | 'loja2'>('loja1')

  // Se não é loja nem admin, redirecionar
  useEffect(() => {
    if (usuario && usuario.role !== 'loja' && usuario.role !== 'admin') {
      router.push('/expedicao')
    }
  }, [usuario, router])

  // Origem: a loja de quem está logado; o admin escolhe de qual loja sai o estoque.
  const origem: Unidade | null = usuario?.role === 'admin' ? origemAdmin : usuario?.loja_id === 'loja1' || usuario?.loja_id === 'loja2' ? usuario.loja_id : null

  // Transferência simples = para a outra loja; devoluções = sempre para a cozinha.
  const destinosPermitidos = destinosDoMotivo(motivo, origem)
  const destinoEfetivo: Unidade = destinosPermitidos.includes(destino) ? destino : destinosPermitidos[0]
  const destinoFixo = destinosPermitidos.length === 1

  function avancar() {
    if (!origem || !destinoEfetivo) return
    const params = new URLSearchParams({ motivo })
    if (usuario?.role === 'admin') params.set('origem', origemAdmin)
    router.push(`/expedicao/nova-transferencia/${destinoEfetivo}?${params.toString()}`)
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
          {usuario?.role === 'admin' && (
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-3">🏪 Origem (estoque de qual loja)</label>
              <select
                value={origemAdmin}
                onChange={(e) => setOrigemAdmin(e.target.value as 'loja1' | 'loja2')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="loja1">Paraisópolis</option>
                <option value="loja2">Itajubá</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">📝 Motivo</label>
            <div className="space-y-2">
              {MOTIVOS_TRANSFERENCIA.map((m) => (
                <label
                  key={m.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    motivo === m.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="motivo"
                    checked={motivo === m.key}
                    onChange={() => setMotivo(m.key)}
                    className="mt-1 accent-blue-600"
                  />
                  <span>
                    <span className="block font-semibold text-gray-800">{m.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{m.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-3">📍 Destino</label>
            {destinoFixo ? (
              <p className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-800">
                {LOCAL_LABEL[destinoEfetivo]}
                <span className="text-xs text-gray-500 ml-2">
                  {destinoEfetivo === 'cozinha' ? '(devoluções sempre voltam para a cozinha)' : '(a outra loja)'}
                </span>
              </p>
            ) : (
              <select
                value={destinoEfetivo}
                onChange={(e) => setDestino(e.target.value as Unidade)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {destinosPermitidos.map((d) => (
                  <option key={d} value={d}>
                    {LOCAL_LABEL[d]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!origem && usuario?.role === 'loja' && (
            <p className="text-sm text-red-600">Seu usuário não está associado a uma loja. Peça ao administrador para ajustar o cadastro.</p>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={avancar}
              disabled={!origem}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Próximo: Selecionar Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
