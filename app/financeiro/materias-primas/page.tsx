'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'

export default function MateriasPrimasPage() {
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [custos, setCustos] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('financeiro_materias_primas').select('*').order('nome')
    setMaterias(data || [])

    const mesAtual = new Date()
    const mesRef = `${mesAtual.getFullYear()}-${String(mesAtual.getMonth() + 1).padStart(2, '0')}-01`
    const { data: custoData } = await supabase
      .from('financeiro_custo_medio_mensal')
      .select('materia_prima_id, custo_medio_por_unidade_medida')
      .eq('mes_referencia', mesRef)
    const mapa: Record<string, number> = {}
    ;(custoData || []).forEach((c: any) => {
      mapa[c.materia_prima_id] = c.custo_medio_por_unidade_medida
    })
    setCustos(mapa)
    setLoading(false)
  }

  const filtradas = materias.filter((m) => m.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Matérias-Primas</h1>
            </div>
            <Link
              href="/financeiro/materias-primas/nova"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Nova
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar matéria-prima..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <EmptyState
              title="Nenhuma matéria-prima cadastrada"
              description="Cadastre aqui os insumos comprados (farinha, leite, chocolate...) para lançar compras sem digitar texto livre"
            />
          ) : (
            <div className="space-y-2">
              {filtradas.map((m) => (
                <Link key={m.id} href={`/financeiro/materias-primas/${m.id}`}>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{m.nome}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Compra em {m.unidade_compra} · usa em {m.unidade_medida} (1 {m.unidade_compra} = {m.fator_conversao} {m.unidade_medida})
                        </p>
                      </div>
                      <div className="text-right">
                        {custos[m.id] != null ? (
                          <p className="text-sm font-semibold text-gray-800">
                            {formatBRL(custos[m.id])}<span className="text-xs text-gray-400">/{m.unidade_medida}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-400">Sem compras no mês</p>
                        )}
                        {!m.ativo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>}
                      </div>
                    </div>
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
