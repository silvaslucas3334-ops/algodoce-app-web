'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, CheckCircle, XCircle, ShoppingCart, ReceiptText } from 'lucide-react'
import { FinanceiroConta, FinanceiroLancamentoItem } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL, CONDICAO_PAGAMENTO_LABEL, TIPO_LANCAMENTO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { formatarDocumento, hojeISO, statusExibicao } from '@/lib/financeiro-utils'

export default function DetalheDespesaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lancamentoId = params.id as string

  const [lancamento, setLancamento] = useState<any>(null)
  const [itens, setItens] = useState<FinanceiroLancamentoItem[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [lancamentoId])

  useEffect(() => {
    if (usuario?.role !== 'admin') return
    supabase
      .from('financeiro_contas')
      .select('*')
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [usuario?.role])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .select('*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome)')
      .eq('id', lancamentoId)
      .single()
    if (error) console.error('Erro:', error)
    setLancamento(data)

    if (data?.tipo === 'compra_insumos') {
      const { data: itensData } = await supabase
        .from('financeiro_lancamento_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome, unidade_medida), conta:financeiro_contas(codigo, nome)')
        .eq('lancamento_id', lancamentoId)
        .order('created_at')
      setItens(itensData || [])
    }
    setLoading(false)
  }

  const unidadeDoUsuario = usuario?.role === 'cozinha' ? 'rateio' : usuario?.role === 'loja' ? usuario?.loja_id : null
  const podeEditar =
    usuario?.role === 'admin' || (lancamento && lancamento.unidade === unidadeDoUsuario && lancamento.status === 'aberto')

  async function marcarPago() {
    if (!lancamento) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: hojeISO(), updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao marcar como paga: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function cancelar() {
    if (!lancamento) return
    if (!window.confirm('Cancelar este lançamento?')) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      router.push('/financeiro/despesas')
    } catch (err: any) {
      setErro('Erro ao cancelar: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  async function reclassificarConta(novaContaId: string) {
    if (!lancamento) return
    // Na despesa a conta é obrigatória — não permitir voltar para vazio.
    if (lancamento.tipo === 'despesa' && !novaContaId) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ conta_id: novaContaId || null, updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao reclassificar: ' + (err?.message || 'desconhecido'))
    } finally {
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

  if (!lancamento) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Lançamento não encontrado</div>
      </ProtectedRoute>
    )
  }

  const st = statusExibicao(lancamento.status, lancamento.data_vencimento)

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro/despesas')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800">{lancamento.descricao}</h1>
              <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                {lancamento.tipo === 'compra_insumos' ? <ShoppingCart size={12} /> : <ReceiptText size={12} />}
                {TIPO_LANCAMENTO_LABEL[lancamento.tipo]}
                {lancamento.parcela_num && lancamento.parcela_total && ` · parcela ${lancamento.parcela_num}/${lancamento.parcela_total}`}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${st.cor}`}>{st.label}</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Beneficiário</span>
              <span className="font-medium text-gray-800 text-right">
                {lancamento.parte?.nome}
                {lancamento.parte?.documento && (
                  <span className="block text-xs text-gray-400 font-normal">{formatarDocumento(lancamento.parte.documento)}</span>
                )}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="font-semibold text-gray-800">{formatBRL(lancamento.valor_total)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Data do lançamento</span><span className="text-gray-800">{new Date(lancamento.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Vencimento</span><span className="text-gray-800">{new Date(lancamento.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
            {lancamento.data_pagamento && (
              <div className="flex justify-between"><span className="text-gray-500">Paga em</span><span className="text-gray-800">{new Date(lancamento.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
            )}
            {lancamento.forma_pagamento && (
              <div className="flex justify-between"><span className="text-gray-500">Forma de pagamento</span><span className="text-gray-800">{FORMA_PAGAMENTO_LABEL[lancamento.forma_pagamento]}</span></div>
            )}
            {lancamento.condicao_pagamento && (
              <div className="flex justify-between"><span className="text-gray-500">Condição</span><span className="text-gray-800">{CONDICAO_PAGAMENTO_LABEL[lancamento.condicao_pagamento]}</span></div>
            )}
            <div className="flex justify-between"><span className="text-gray-500">Unidade</span><span className="text-gray-800">{UNIDADE_LABEL[lancamento.unidade]}</span></div>
            {lancamento.numero_documento && (
              <div className="flex justify-between"><span className="text-gray-500">Documento</span><span className="text-gray-800">{lancamento.numero_documento}</span></div>
            )}
            {lancamento.recorrencia_id && (
              <div className="flex justify-between"><span className="text-gray-500">Origem</span><span className="text-purple-700">🔄 Despesa recorrente</span></div>
            )}

            {lancamento.tipo === 'despesa' && (
              <div className="flex justify-between items-center gap-3 pt-2 border-t border-gray-100">
                <span className="text-gray-500">Conta contábil</span>
                {usuario?.role === 'admin' ? (
                  <select
                    value={lancamento.conta_id || ''}
                    onChange={(e) => reclassificarConta(e.target.value)}
                    disabled={processando}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white max-w-[60%]"
                  >
                    {contas
                      .filter((c) => c.aplicavel_a !== 'compras_insumos')
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                      ))}
                  </select>
                ) : (
                  <span className="text-gray-800">{lancamento.conta ? `${lancamento.conta.codigo} — ${lancamento.conta.nome}` : 'Não classificada'}</span>
                )}
              </div>
            )}
          </div>

          {lancamento.tipo === 'compra_insumos' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-3">Itens da nota ({itens.length})</h2>
              {itens.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {lancamento.parcela_num && lancamento.parcela_num > 1
                    ? 'Os itens desta nota ficam registrados na parcela 1.'
                    : 'Nenhum item registrado.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {itens.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{item.materia_prima?.nome}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantidade} {item.unidade_nota} × {formatBRL(item.valor_unitario)}
                          {' · '}{formatBRL(item.valor_total / (item.quantidade * item.fator_conversao))}/{item.materia_prima?.unidade_medida}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${item.conta ? 'text-blue-600' : 'text-amber-600'}`}>
                          {item.conta ? `${item.conta.codigo} — ${item.conta.nome}` : 'Sem conta definida'}
                        </p>
                      </div>
                      <p className="font-semibold text-gray-800">{formatBRL(item.valor_total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {podeEditar && lancamento.status === 'aberto' && (
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
                <CheckCircle size={18} /> {processando ? 'Salvando...' : 'Marcar como Paga'}
              </button>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
