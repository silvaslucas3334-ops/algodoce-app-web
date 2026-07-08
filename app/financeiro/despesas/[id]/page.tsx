'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, CheckCircle, XCircle } from 'lucide-react'
import { FinanceiroConta } from '@/lib/types'
import { FINANCEIRO_STATUS_LABEL, UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'

export default function DetalheDespesaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const despesaId = params.id as string

  const [despesa, setDespesa] = useState<any>(null)
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [despesaId])

  useEffect(() => {
    if (usuario?.role !== 'admin') return
    supabase
      .from('financeiro_contas')
      .select('*')
      .in('aplicavel_a', ['despesas_gerais', 'ambos'])
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [usuario?.role])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_despesas')
      .select('*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome)')
      .eq('id', despesaId)
      .single()
    if (error) console.error('Erro:', error)
    setDespesa(data)
    setLoading(false)
  }

  const unidadeDoUsuario = usuario?.role === 'cozinha' ? 'cozinha' : usuario?.role === 'loja' ? usuario?.loja_id : null
  const podeEditar = usuario?.role === 'admin' || (despesa && despesa.unidade === unidadeDoUsuario && despesa.status === 'aberto')

  async function reclassificarConta(novaContaId: string) {
    if (!despesa) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_despesas')
        .update({ conta_id: novaContaId || null, updated_at: new Date().toISOString() })
        .eq('id', despesaId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao reclassificar: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function marcarPago() {
    if (!despesa) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_despesas')
        .update({ status: 'pago', data_pagamento: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
        .eq('id', despesaId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao marcar como pago: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function cancelar() {
    if (!despesa) return
    if (!window.confirm('Cancelar esta despesa?')) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_despesas')
        .update({ status: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', despesaId)
      if (error) throw error
      router.push('/financeiro/despesas')
    } catch (err: any) {
      setErro('Erro ao cancelar: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!despesa) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Despesa não encontrada</div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">{despesa.descricao}</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Beneficiário</span><span className="font-medium text-gray-800">{despesa.parte?.nome}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="font-semibold text-gray-800">{formatBRL(despesa.valor)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Vencimento</span><span className="text-gray-800">{new Date(despesa.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
            {despesa.data_pagamento && (
              <div className="flex justify-between"><span className="text-gray-500">Pago em</span><span className="text-gray-800">{new Date(despesa.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Unidade</span><span className="text-gray-800">{UNIDADE_LABEL[despesa.unidade]}</span></div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-gray-500">Conta contábil</span>
              {usuario?.role === 'admin' ? (
                <select
                  value={despesa.conta_id || ''}
                  onChange={(e) => reclassificarConta(e.target.value)}
                  disabled={processando}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white max-w-[60%]"
                >
                  <option value="">Não classificada</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                  ))}
                </select>
              ) : (
                <span className="text-gray-800">{despesa.conta ? `${despesa.conta.codigo} — ${despesa.conta.nome}` : 'Não classificada'}</span>
              )}
            </div>
            {despesa.numero_documento && (
              <div className="flex justify-between"><span className="text-gray-500">Documento</span><span className="text-gray-800">{despesa.numero_documento}</span></div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-gray-500">Status</span>
              <span className="font-semibold text-gray-800">{FINANCEIRO_STATUS_LABEL[despesa.status]}</span>
            </div>
          </div>

          {podeEditar && despesa.status === 'aberto' && (
            <div className="flex gap-3">
              <button
                onClick={cancelar}
                disabled={processando}
                className="flex-1 px-4 py-3 border border-red-300 rounded-lg font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle size={18} /> Cancelar
              </button>
              <button
                onClick={marcarPago}
                disabled={processando}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} /> {processando ? 'Salvando...' : 'Marcar como Pago'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
