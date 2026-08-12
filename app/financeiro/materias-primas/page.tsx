'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'
import { Plus, Search, BarChart3, Receipt } from 'lucide-react'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { buscarCustosAtuaisMateriasPrimas, CustoAtualMateriaPrima } from '@/lib/financeiro-cmv'
import CustoAtualBadges, { labelMesReferencia } from '@/components/CustoAtualBadge'

export default function MateriasPrimasPage() {
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [custos, setCustos] = useState<Map<string, CustoAtualMateriaPrima>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('financeiro_materias_primas').select('*').order('nome')
    setMaterias(data || [])
    setCustos(await buscarCustosAtuaisMateriasPrimas((data || []).map((m: any) => m.id)))
    setLoading(false)
  }

  const filtradas = materias.filter((m) => m.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="Matérias-Primas"
          backHref="/financeiro"
          maxWidth="max-w-4xl"
          actions={
            <div className="flex gap-2">
              <Link
                href="/financeiro/materias-primas/melhor-compra"
                className="border border-pink-700 text-pink-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-pink-50"
              >
                <BarChart3 size={16} /> Melhor Compra
              </Link>
              <Link
                href="/financeiro/materias-primas/compras"
                className="border border-pink-700 text-pink-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2 hover:bg-pink-50"
              >
                <Receipt size={16} /> Compras
              </Link>
              <Link
                href="/financeiro/materias-primas/nova"
                className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
              >
                <Plus size={18} /> Nova
              </Link>
            </div>
          }
        />

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
                        <p className="font-semibold text-gray-800">{m.codigo} · {m.nome}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Compra em {m.unidade_compra} · usa em {m.unidade_medida} (1 {m.unidade_compra} = {m.fator_conversao} {m.unidade_medida})
                        </p>
                      </div>
                      <div className="text-right">
                        {custos.get(m.id) ? (
                          <>
                            <p className="text-sm font-semibold text-gray-800">
                              {formatBRL(custos.get(m.id)!.custo)}<span className="text-xs text-gray-400">/{m.unidade_medida}</span>
                            </p>
                            {custos.get(m.id)!.origem === 'calculado' && custos.get(m.id)!.mesReferencia && (
                              <p className="text-[11px] text-gray-400">preço de {labelMesReferencia(custos.get(m.id)!.mesReferencia!)}</p>
                            )}
                            <div className="mt-0.5"><CustoAtualBadges custo={custos.get(m.id)!} /></div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">Sem custo conhecido</p>
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
