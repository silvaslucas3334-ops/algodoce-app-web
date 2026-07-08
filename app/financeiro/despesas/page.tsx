'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { FinanceiroDespesa, StatusFinanceiro } from '@/lib/types'
import { FINANCEIRO_STATUS_LABEL, UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'

const STATUS_COLOR: Record<StatusFinanceiro, string> = {
  aberto: 'bg-amber-100 text-amber-700',
  pago: 'bg-green-100 text-green-700',
  cancelado: 'bg-gray-100 text-gray-500',
}

export default function DespesasPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [despesas, setDespesas] = useState<FinanceiroDespesa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<StatusFinanceiro>('aberto')
  const [somenteSemConta, setSomenteSemConta] = useState(false)

  useEffect(() => {
    if (usuario) carregar()
  }, [usuario, filtroStatus])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_despesas')
      .select('*, parte:financeiro_partes!parte_id(nome), conta:financeiro_contas(nome)')
      .eq('status', filtroStatus)
      .order('data_vencimento', { ascending: filtroStatus === 'aberto' })
    if (error) console.error('Erro ao carregar despesas:', error)
    setDespesas(data || [])
    setLoading(false)
  }

  const listaFiltrada = somenteSemConta ? despesas.filter((d) => !d.conta_id) : despesas

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Despesas Gerais</h1>
            </div>
            <Link
              href="/financeiro/despesas/nova"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Nova
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {(['aberto', 'pago', 'cancelado'] as StatusFinanceiro[]).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${
                  filtroStatus === s ? STATUS_COLOR[s] + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {FINANCEIRO_STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {usuario?.role === 'admin' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 mb-4">
              <input type="checkbox" checked={somenteSemConta} onChange={(e) => setSomenteSemConta(e.target.checked)} className="w-4 h-4 rounded" />
              Mostrar só sem conta contábil definida
            </label>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : listaFiltrada.length === 0 ? (
            <EmptyState title={`Nenhuma despesa ${FINANCEIRO_STATUS_LABEL[filtroStatus].toLowerCase()}`} description="Quando houver despesas, elas aparecem aqui" />
          ) : (
            <div className="space-y-2">
              {listaFiltrada.map((d) => (
                <Link key={d.id} href={`/financeiro/despesas/${d.id}`}>
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-800">{d.descricao}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {d.parte?.nome} · {UNIDADE_LABEL[d.unidade]}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Vencimento: {new Date(d.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                          {!d.conta_id && <span className="ml-2 text-amber-600">· sem conta definida</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-800">{formatBRL(d.valor)}</p>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${STATUS_COLOR[d.status]}`}>
                          {FINANCEIRO_STATUS_LABEL[d.status]}
                        </span>
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
