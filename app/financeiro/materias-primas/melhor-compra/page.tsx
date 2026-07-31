'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { Search } from 'lucide-react'
import { FinanceiroCustoPorFornecedor, FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { agruparCustoPorFornecedor, MelhorCompraGrupo } from '@/lib/financeiro-melhor-compra'

export default function MelhorCompraPage() {
  const [grupos, setGrupos] = useState<MelhorCompraGrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: custos }, { data: materias }] = await Promise.all([
      supabase.from('financeiro_custo_por_fornecedor').select('*'),
      supabase.from('financeiro_materias_primas').select('id, nome, unidade_medida').eq('ativo', true),
    ])
    setGrupos(agruparCustoPorFornecedor((custos || []) as FinanceiroCustoPorFornecedor[], (materias || []) as FinanceiroMateriaPrima[]))
    setLoading(false)
  }

  const filtrados = grupos.filter((g) => g.materia_prima_nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Análise de Melhor Compra" backHref="/financeiro/materias-primas" maxWidth="max-w-4xl" />

        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs text-gray-500 mb-4">
            Compara, por item, todos os fornecedores que já venderam pra você — o mais barato aparece primeiro. Sem filtro de
            período por enquanto (todo o histórico registrado).
          </p>

          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar item..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <EmptyState title="Nada pra comparar ainda" description="Assim que houver compras registradas com matéria-prima e fornecedor, elas aparecem aqui." />
          ) : (
            <div className="space-y-3">
              {filtrados.map((grupo) => (
                <div key={grupo.materia_prima_id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-800">{grupo.materia_prima_nome}</p>
                    {grupo.fornecedores.length === 1 && (
                      <span className="text-xs text-gray-400">Só um fornecedor — nada a comparar ainda</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2 pr-3">Fornecedor</th>
                          <th className="py-2 pr-3">Custo médio/{grupo.unidade_medida}</th>
                          <th className="py-2 pr-3">Nº compras</th>
                          <th className="py-2 pr-3">Última compra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.fornecedores.map((f) => (
                          <tr key={f.parte_id} className="border-b border-gray-100">
                            <td className="py-2 pr-3 font-medium text-gray-800">
                              {f.fornecedor_nome}
                              {f.melhorPreco && (
                                <span className="ml-2 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                                  Melhor preço
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-gray-800">{formatBRL(f.custo_medio_por_unidade_medida)}</td>
                            <td className="py-2 pr-3 text-gray-600">{f.numero_compras}</td>
                            <td className="py-2 pr-3 text-gray-600">{new Date(f.ultima_compra + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
