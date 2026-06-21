'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const LOCAL_LABEL: Record<string, string> = { loja1: 'Loja 1', loja2: 'Loja 2', cozinha: 'Cozinha' }

export default function EstoquePage() {
  const [local, setLocal] = useState('loja1')
  const [lotes, setLotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('lotes_producao')
      .select('*, produto:produtos(nome, tipo, unidade_medida, congelado)')
      .eq('destino', local)
      .eq('status', 'na_loja')
      .order('data_validade')
      .then(({ data }) => { setLotes(data || []); setLoading(false) })
  }, [local])

  const hoje = new Date().toISOString().split('T')[0]
  const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

  function validadeColor(data: string) {
    if (data <= hoje) return 'text-red-600 font-bold'
    if (data <= em3dias) return 'text-amber-600 font-semibold'
    return 'text-gray-500'
  }

  const agrupado = lotes.reduce((acc, lote) => {
    const nome = lote.produto?.nome || 'Desconhecido'
    if (!acc[nome]) acc[nome] = []
    acc[nome].push(lote)
    return acc
  }, {} as Record<string, any[]>)

  const entries = Object.entries(agrupado) as [string, any[]][]

  return (
    <div className="p-4">
      <div className="pt-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800 mb-3">Estoque</h1>
        <div className="flex gap-2">
          {Object.entries(LOCAL_LABEL).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLocal(key)}
              className={`px-4 py-1.5 rounded-full text-sm border ${local === key ? 'bg-pink-700 text-white border-pink-700 font-semibold' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : Object.keys(agrupado).length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sem estoque em {LOCAL_LABEL[local]}</div>
      ) : (
        <div className="space-y-3">
          {entries.map(([nome, lotesGrupo]) => {
            const total = lotesGrupo.reduce((s, l) => s + l.quantidade, 0)
            const menorValidade = lotesGrupo.reduce((m, l) => l.data_validade < m ? l.data_validade : m, lotesGrupo[0].data_validade)
            return (
              <div key={nome} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{nome}</p>
                    <p className="text-sm text-gray-500">{total} {lotesGrupo[0].produto?.unidade_medida === 'Gramas' ? 'potes' : 'unidades'}{lotesGrupo[0].produto?.congelado ? ' ❄️' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Validade mais próx.</p>
                    <p className={`text-sm ${validadeColor(menorValidade)}`}>
                      {new Date(menorValidade + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                {lotesGrupo.length > 1 && (
                  <p className="text-xs text-gray-400 mt-1">{lotesGrupo.length} lotes</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
