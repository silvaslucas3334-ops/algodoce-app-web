'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, CalendarPlus } from 'lucide-react'
import { LOCAL_LABEL } from '@/lib/constants'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function NovoRomaneioPage() {
  const router = useRouter()

  const [dataEntrega, setDataEntrega] = useState('')
  const [unidadeDestino, setUnidadeDestino] = useState('loja1')
  const [personalizarAberto, setPersonalizarAberto] = useState(false)

  const hoje = useMemo(() => new Date(), [])
  const hojeISO = toISODate(hoje)

  // Atalhos: hoje, amanhã e os próximos 5 dias da semana
  const atalhos = useMemo(() => {
    const dias: { valor: string; label: string; sublabel: string }[] = []
    for (let i = 0; i <= 6; i++) {
      const d = new Date(hoje)
      d.setDate(d.getDate() + i)
      const valor = toISODate(d)
      const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIAS_SEMANA[d.getDay()]
      const sublabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
      dias.push({ valor, label, sublabel })
    }
    return dias
  }, [hoje])

  const isAtalho = atalhos.some((a) => a.valor === dataEntrega)
  const personalizarAtivo = personalizarAberto || (!!dataEntrega && !isAtalho)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Novo Romaneio</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          {/* Data de entrega */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar size={18} />
              Data de Entrega
            </label>
            <div className="flex flex-wrap gap-2 mt-3">
              {atalhos.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  onClick={() => {
                    setDataEntrega(a.valor)
                    setPersonalizarAberto(false)
                  }}
                  className={`flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border-2 min-w-[68px] transition-colors ${
                    dataEntrega === a.valor
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }`}
                >
                  <span className="text-sm font-bold">{a.label}</span>
                  <span className={`text-xs ${dataEntrega === a.valor ? 'text-blue-100' : 'text-gray-400'}`}>
                    {a.sublabel}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPersonalizarAberto((prev) => !prev)}
                className={`flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border-2 min-w-[68px] transition-colors ${
                  personalizarAtivo
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                }`}
              >
                <CalendarPlus size={16} className={personalizarAtivo ? 'text-white' : 'text-gray-500'} />
                <span className={`text-xs ${personalizarAtivo ? 'text-blue-100' : 'text-gray-400'}`}>
                  Outra data
                </span>
              </button>
            </div>

            {personalizarAtivo && (
              <input
                type="date"
                value={dataEntrega}
                onChange={(e) => setDataEntrega(e.target.value)}
                min={hojeISO}
                autoFocus
                className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}
          </div>

          {/* Unidade de destino */}
          <div>
            <label className="text-sm font-semibold text-gray-800 mb-3 block">📍 Unidade de Destino</label>
            <div className="grid grid-cols-2 gap-3">
              {['loja1', 'loja2'].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidadeDestino(u)}
                  className={`px-4 py-4 rounded-xl border-2 font-bold text-center transition-colors ${
                    unidadeDestino === u
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }`}
                >
                  {LOCAL_LABEL[u]}
                </button>
              ))}
            </div>
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
