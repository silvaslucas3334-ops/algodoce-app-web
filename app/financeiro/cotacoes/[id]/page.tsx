'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import ResponderCotacaoModal from '@/components/ResponderCotacaoModal'
import { fecharCotacao } from '@/lib/financeiro-cotacoes'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { FinanceiroCotacao, FinanceiroCotacaoItem, FinanceiroCotacaoFornecedor, FinanceiroCotacaoPreco } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'

type FornecedorComPrecos = FinanceiroCotacaoFornecedor & { precos: FinanceiroCotacaoPreco[] }

export default function DetalheCotacaoPage() {
  const router = useRouter()
  const params = useParams()
  const cotacaoId = params.id as string

  const [cotacao, setCotacao] = useState<FinanceiroCotacao | null>(null)
  const [itens, setItens] = useState<FinanceiroCotacaoItem[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorComPrecos[]>([])
  const [loading, setLoading] = useState(true)
  const [modalResponder, setModalResponder] = useState<FornecedorComPrecos | null>(null)
  const [fechando, setFechando] = useState(false)
  const [fornecedorEscolhido, setFornecedorEscolhido] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [cotacaoId])

  async function carregar() {
    setLoading(true)
    const [{ data: cot }, { data: itensData }, { data: fornecedoresData }] = await Promise.all([
      supabase
        .from('financeiro_cotacoes')
        .select('*, fornecedor_vencedor:financeiro_partes!fornecedor_vencedor_id(nome)')
        .eq('id', cotacaoId)
        .single(),
      supabase
        .from('financeiro_cotacao_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome, unidade_medida)')
        .eq('cotacao_id', cotacaoId),
      supabase
        .from('financeiro_cotacao_fornecedores')
        .select('*, parte:financeiro_partes!parte_id(nome), precos:financeiro_cotacao_precos(*)')
        .eq('cotacao_id', cotacaoId),
    ])
    setCotacao(cot)
    setItens(itensData || [])
    setFornecedores(fornecedoresData || [])
    setLoading(false)
  }

  const respondidos = fornecedores.filter((f) => f.status === 'respondido')

  // Menor preço unitário por item, entre os fornecedores que cotaram (disponivel=true).
  function menorUnitarioDoItem(itemId: string): number | null {
    const valores = respondidos
      .map((f) => f.precos.find((p) => p.cotacao_item_id === itemId))
      .filter((p) => p && p.disponivel && p.valor_unitario != null)
      .map((p) => p!.valor_unitario!)
    return valores.length > 0 ? Math.min(...valores) : null
  }

  function totalDoFornecedor(f: FornecedorComPrecos) {
    const itensCotados = f.precos.filter((p) => p.disponivel && p.valor_total != null)
    const total = itensCotados.reduce((acc, p) => acc + (p.valor_total || 0), 0)
    return { total, itensCotados: itensCotados.length, totalItens: itens.length }
  }

  const menorTotal =
    respondidos.length > 0
      ? Math.min(
          ...respondidos
            .filter((f) => totalDoFornecedor(f).itensCotados === itens.length)
            .map((f) => totalDoFornecedor(f).total)
        )
      : null

  async function confirmarFechamento() {
    if (!fornecedorEscolhido) return
    setFechando(true)
    setErro('')
    try {
      await fecharCotacao(cotacaoId, fornecedorEscolhido)
      router.push(`/financeiro/compras/nova?cotacaoId=${cotacaoId}`)
    } catch (err: any) {
      setErro('Erro ao fechar cotação: ' + (err?.message || 'desconhecido'))
      setFechando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!cotacao) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Cotação não encontrada</div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro/cotacoes')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{cotacao.titulo}</h1>
              <p className="text-xs text-gray-500">
                {UNIDADE_LABEL[cotacao.unidade]}
                {cotacao.status === 'fechada' && cotacao.fornecedor_vencedor?.nome && ` · Fechada com ${cotacao.fornecedor_vencedor.nome}`}
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {/* Itens */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-3">Itens ({itens.length})</h2>
            <div className="space-y-1">
              {itens.map((item) => (
                <p key={item.id} className="text-sm text-gray-700">
                  {item.materia_prima?.nome} — {item.quantidade} {item.unidade_cotacao}
                  {item.observacao && <span className="text-gray-400"> · {item.observacao}</span>}
                </p>
              ))}
            </div>
          </div>

          {/* Fornecedores convidados */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-3">Fornecedores convidados</h2>
            <div className="space-y-2">
              {fornecedores.map((f) => (
                <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{f.parte?.nome}</p>
                    <p className="text-xs text-gray-500">
                      {f.status === 'respondido' ? `Respondeu · ${totalDoFornecedor(f).itensCotados}/${itens.length} itens cotados` : 'Aguardando resposta'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/financeiro/cotacoes/${cotacaoId}/pdf/${f.id}`)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 flex items-center gap-1"
                    >
                      <FileText size={14} /> PDF
                    </button>
                    <button
                      onClick={() => setModalResponder(f)}
                      className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800"
                    >
                      {f.status === 'respondido' ? 'Editar preços' : 'Responder'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Comparação */}
          {respondidos.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-800 mb-3">Comparação</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3">Item</th>
                      {respondidos.map((f) => (
                        <th key={f.id} className="py-2 pr-3 whitespace-nowrap">{f.parte?.nome}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => {
                      const menor = menorUnitarioDoItem(item.id)
                      return (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="py-2 pr-3 text-gray-700">{item.materia_prima?.nome}</td>
                          {respondidos.map((f) => {
                            const p = f.precos.find((x) => x.cotacao_item_id === item.id)
                            if (!p) return <td key={f.id} className="py-2 pr-3 text-gray-300">—</td>
                            if (!p.disponivel) return <td key={f.id} className="py-2 pr-3 text-gray-400 text-xs">Sem item</td>
                            const menorAqui = menor != null && p.valor_unitario === menor
                            return (
                              <td key={f.id} className={`py-2 pr-3 ${menorAqui ? 'text-green-700 font-semibold' : 'text-gray-600'}`}>
                                {formatBRL(p.valor_unitario || 0)}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300">
                      <td className="py-2 pr-3 font-semibold text-gray-800">Total</td>
                      {respondidos.map((f) => {
                        const { total, itensCotados, totalItens } = totalDoFornecedor(f)
                        const completo = itensCotados === totalItens
                        const menorAqui = completo && menorTotal != null && total === menorTotal
                        return (
                          <td key={f.id} className={`py-2 pr-3 ${menorAqui ? 'text-green-700 font-bold' : 'text-gray-800 font-semibold'}`}>
                            {formatBRL(total)}
                            {!completo && (
                              <span className="block text-[10px] font-normal text-amber-600 flex items-center gap-1">
                                <AlertCircle size={10} /> {itensCotados}/{totalItens} itens
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fechar cotação */}
          {cotacao.status === 'aberta' && respondidos.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3">
              <h2 className="font-semibold text-gray-800">Fechar cotação</h2>
              <p className="text-xs text-gray-500">Escolha o fornecedor vencedor entre os que responderam.</p>
              <div className="grid grid-cols-2 gap-2">
                {respondidos.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFornecedorEscolhido(f.parte_id)}
                    className={`px-3 py-2 rounded-lg border-2 text-sm text-left ${
                      fornecedorEscolhido === f.parte_id ? 'border-pink-600 bg-pink-50 text-pink-800 font-semibold' : 'border-gray-200 bg-white text-gray-700'
                    }`}
                  >
                    {f.parte?.nome} — {formatBRL(totalDoFornecedor(f).total)}
                  </button>
                ))}
              </div>
              <button
                onClick={confirmarFechamento}
                disabled={!fornecedorEscolhido || fechando}
                className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> {fechando ? 'Fechando...' : 'Fechar cotação e lançar nota'}
              </button>
            </div>
          )}
        </div>
      </div>

      {modalResponder && (
        <ResponderCotacaoModal
          cotacaoFornecedor={modalResponder}
          itens={itens}
          precosExistentes={modalResponder.precos}
          onClose={() => setModalResponder(null)}
          onResolvido={carregar}
        />
      )}
    </ProtectedRoute>
  )
}
