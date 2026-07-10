'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { UNIDADE_LABEL } from '@/lib/constants'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

interface PeriodoResumo {
  chave: string // AAAA-MM
  ano: number
  mes: number
  quantidade: number
}

export default function PdvHubPage() {
  const router = useRouter()
  const [unidade, setUnidade] = useState<'loja1' | 'loja2'>('loja1')
  const [periodos, setPeriodos] = useState<PeriodoResumo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [unidade])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_pdv_pedidos')
      .select('data_abertura')
      .eq('unidade', unidade)
    if (error) console.error('Erro ao carregar períodos do PDV:', error)

    const mapa = new Map<string, PeriodoResumo>()
    ;(data || []).forEach((row: { data_abertura: string }) => {
      const d = new Date(row.data_abertura)
      const ano = d.getFullYear()
      const mes = d.getMonth() // 0-based
      const chave = `${ano}-${String(mes + 1).padStart(2, '0')}`
      if (!mapa.has(chave)) mapa.set(chave, { chave, ano, mes, quantidade: 0 })
      mapa.get(chave)!.quantidade++
    })
    setPeriodos(Array.from(mapa.values()).sort((a, b) => b.chave.localeCompare(a.chave)))
    setLoading(false)
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Import do PDV</h1>
            </div>
            <Link
              href="/financeiro/pdv/importar"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Importar
            </Link>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-4">
            {(['loja1', 'loja2'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnidade(u)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                  unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {UNIDADE_LABEL[u]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : periodos.length === 0 ? (
            <EmptyState
              title="Nenhum período importado"
              description={`Nenhuma venda do PDV foi importada ainda para ${UNIDADE_LABEL[unidade]}`}
            />
          ) : (
            <div className="space-y-2">
              {periodos.map((p) => (
                <Link key={p.chave} href={`/financeiro/pdv/${unidade}-${p.chave}`}>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all flex items-center justify-between">
                    <p className="font-semibold text-gray-800">{MESES[p.mes]} de {p.ano}</p>
                    <p className="text-sm text-gray-500">{p.quantidade} pedido{p.quantidade !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
