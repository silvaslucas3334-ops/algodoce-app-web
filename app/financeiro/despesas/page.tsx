'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Search, ReceiptText, ShoppingCart, CheckCircle } from 'lucide-react'
import { FinanceiroLancamento } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { hojeISO, somarDias, statusExibicao } from '@/lib/financeiro-utils'

type Filtro = 'atrasadas' | 'vence7' | 'aberto' | 'pagas' | 'canceladas'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'vence7', label: 'Vence em 7 dias' },
  { key: 'aberto', label: 'Em aberto' },
  { key: 'pagas', label: 'Pagas' },
  { key: 'canceladas', label: 'Canceladas' },
]

export default function DespesasPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [busca, setBusca] = useState('')
  const [pagandoId, setPagandoId] = useState<string | null>(null)

  useEffect(() => {
    if (usuario) carregar()
  }, [usuario, filtro])

  async function carregar() {
    setLoading(true)
    const hoje = hojeISO()
    let query = supabase
      .from('financeiro_lancamentos')
      .select('*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome)')

    if (filtro === 'atrasadas') {
      query = query.eq('status', 'aberto').lt('data_vencimento', hoje).order('data_vencimento')
    } else if (filtro === 'vence7') {
      query = query.eq('status', 'aberto').gte('data_vencimento', hoje).lte('data_vencimento', somarDias(hoje, 7)).order('data_vencimento')
    } else if (filtro === 'aberto') {
      query = query.eq('status', 'aberto').order('data_vencimento')
    } else if (filtro === 'pagas') {
      query = query.eq('status', 'pago').order('data_pagamento', { ascending: false })
    } else {
      query = query.eq('status', 'cancelado').order('updated_at', { ascending: false })
    }

    const { data, error } = await query
    if (error) console.error('Erro ao carregar despesas:', error)
    setLancamentos(data || [])
    setLoading(false)
  }

  async function marcarPago(l: FinanceiroLancamento) {
    setPagandoId(l.id)
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: hojeISO(), updated_at: new Date().toISOString() })
        .eq('id', l.id)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      console.error('Erro ao marcar pago:', err)
      alert('Erro ao marcar como paga: ' + (err?.message || 'desconhecido'))
    } finally {
      setPagandoId(null)
    }
  }

  const termo = busca.trim().toLowerCase()
  const filtradas = termo
    ? lancamentos.filter(
        (l) =>
          l.descricao.toLowerCase().includes(termo) ||
          (l.parte?.nome || '').toLowerCase().includes(termo) ||
          (l.conta?.nome || '').toLowerCase().includes(termo)
      )
    : lancamentos

  const totalFiltrado = filtradas.reduce((acc, l) => acc + l.valor_total, 0)

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Despesas</h1>
            </div>
            <div className="flex gap-2">
              <Link
                href="/financeiro/compras/nova"
                className="border border-pink-700 text-pink-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-50"
              >
                <ShoppingCart size={16} /> Lançar Nota
              </Link>
              <Link
                href="/financeiro/despesas/nova"
                className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
              >
                <Plus size={16} /> Nova Despesa
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, beneficiário ou conta..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${
                  filtro === f.key
                    ? 'bg-pink-100 text-pink-700 border-transparent font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {!loading && filtradas.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              {filtradas.length} lançamento{filtradas.length > 1 ? 's' : ''} · total {formatBRL(totalFiltrado)}
            </p>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <EmptyState
              title="Nada por aqui"
              description={busca ? `Nenhum lançamento encontrado para "${busca}"` : 'Nenhum lançamento neste filtro'}
            />
          ) : (
            <div className="space-y-2">
              {filtradas.map((l) => {
                const st = statusExibicao(l.status, l.data_vencimento)
                return (
                  <div key={l.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/financeiro/despesas/${l.id}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          {l.tipo === 'compra_insumos' ? (
                            <ShoppingCart size={14} className="text-blue-600 flex-shrink-0" />
                          ) : (
                            <ReceiptText size={14} className="text-purple-600 flex-shrink-0" />
                          )}
                          <p className="font-semibold text-gray-800">{l.descricao}</p>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {l.parte?.nome} · {UNIDADE_LABEL[l.unidade]}
                          {l.conta && <span> · {l.conta.codigo} {l.conta.nome}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {l.status === 'pago' && l.data_pagamento
                            ? `Paga em ${new Date(l.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}`
                            : `Vencimento: ${new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                          {l.tipo === 'despesa' && !l.conta_id && <span className="ml-2 text-amber-600">· sem conta</span>}
                        </p>
                      </Link>
                      <div className="text-right flex flex-col items-end gap-1.5">
                        <p className="font-semibold text-gray-800">{formatBRL(l.valor_total)}</p>
                        <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${st.cor}`}>{st.label}</span>
                        {l.status === 'aberto' && (
                          <button
                            onClick={() => marcarPago(l)}
                            disabled={pagandoId === l.id}
                            className="text-xs px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 flex items-center gap-1"
                          >
                            <CheckCircle size={12} /> {pagandoId === l.id ? 'Salvando...' : 'Pagar'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
