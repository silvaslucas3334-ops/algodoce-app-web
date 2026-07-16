'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search } from 'lucide-react'
import { FinanceiroPrePreparo } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { buscarCustosAtuaisMateriasPrimas, calcularCustoPrePreparo } from '@/lib/financeiro-cmv'

export default function PrePreparosPage() {
  const router = useRouter()
  const [prePreparos, setPrePreparos] = useState<FinanceiroPrePreparo[]>([])
  const [custos, setCustos] = useState<Record<string, ReturnType<typeof calcularCustoPrePreparo>>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('financeiro_pre_preparos')
      .select('*, itens:financeiro_pre_preparo_itens(*, materia_prima:financeiro_materias_primas(nome))')
      .order('nome')
    const lista = data || []
    setPrePreparos(lista)

    const idsMateriaPrima = Array.from(
      new Set(lista.flatMap((p: any) => (p.itens || []).map((i: any) => i.materia_prima_id)))
    )
    const custosMP = await buscarCustosAtuaisMateriasPrimas(idsMateriaPrima)
    const mapa: Record<string, ReturnType<typeof calcularCustoPrePreparo>> = {}
    lista.forEach((p: any) => {
      mapa[p.id] = calcularCustoPrePreparo(p, custosMP)
    })
    setCustos(mapa)
    setLoading(false)
  }

  const filtrados = prePreparos.filter(
    (p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()) || p.codigo.toLowerCase().includes(busca.trim().toLowerCase())
  )

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro/ficha-tecnica')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Pré-Preparados</h1>
            </div>
            <Link
              href="/financeiro/pre-preparos/nova"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Novo
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <EmptyState
              title="Nenhum pré-preparado cadastrado"
              description="Cadastre aqui os itens que a cozinha produz e usa em outras receitas (massa, recheio, brownie...)"
            />
          ) : (
            <div className="space-y-2">
              {filtrados.map((p) => {
                const custo = custos[p.id]
                return (
                  <Link key={p.id} href={`/financeiro/pre-preparos/${p.id}`}>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{p.codigo} · {p.nome}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Rende {p.rendimento_quantidade} {p.unidade_medida}
                          </p>
                        </div>
                        <div className="text-right">
                          {!custo || (p.itens || []).length === 0 ? (
                            <p className="text-xs text-gray-400">Sem itens</p>
                          ) : custo.custoTotal != null ? (
                            <p className="text-sm font-semibold text-gray-800">
                              {formatBRL(custo.custoPorUnidade!)}<span className="text-xs text-gray-400">/{p.unidade_medida}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600">Custo incompleto</p>
                          )}
                          {!p.ativo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
