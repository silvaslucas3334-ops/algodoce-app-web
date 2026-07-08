'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FinanceiroConta, FinanceiroCentroCusto } from '@/lib/types'

const APLICAVEL_LABEL: Record<string, string> = {
  compras_insumos: 'Compras de Insumos',
  despesas_gerais: 'Despesas Gerais',
  ambos: 'Ambos',
}

export default function ContasPage() {
  const router = useRouter()
  const [centros, setCentros] = useState<FinanceiroCentroCusto[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('financeiro_centros_custo').select('*').order('codigo'),
      supabase.from('financeiro_contas').select('*').order('codigo'),
    ]).then(([{ data: c }, { data: ct }]) => {
      setCentros(c || [])
      setContas(ct || [])
      setLoading(false)
    })
  }, [])

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Plano de Contas</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-500 mb-4">
            Somente leitura por enquanto. Centro de custo e conta vêm do seu plano de contas real; o agrupamento por linha de DRE (mostrado abaixo de cada conta) é uma inferência a ajustar se necessário.
          </p>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : (
            <div className="space-y-6">
              {centros.map((cc) => (
                <div key={cc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="font-semibold text-gray-800">{cc.codigo} — {cc.nome}</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {contas.filter((c) => c.centro_custo_id === cc.id).map((c) => (
                      <div key={c.id} className="px-4 py-3 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{c.codigo} — {c.nome}</p>
                          <p className="text-xs text-gray-500">Grupo DRE: {c.grupo_dre}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
                          {APLICAVEL_LABEL[c.aplicavel_a]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
