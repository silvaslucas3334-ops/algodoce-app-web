'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader } from 'lucide-react'
import { FinanceiroMateriaPrima, FinanceiroConta, FinanceiroCustoMedioMensal } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'

export default function DetalheMateriaPrimaPage() {
  const router = useRouter()
  const params = useParams()
  const materiaId = params.id as string

  const [materia, setMateria] = useState<FinanceiroMateriaPrima | null>(null)
  const [compras, setCompras] = useState<any[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [custosMensais, setCustosMensais] = useState<FinanceiroCustoMedioMensal[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [materiaId])

  useEffect(() => {
    supabase
      .from('financeiro_contas')
      .select('*')
      .in('aplicavel_a', ['compras_insumos', 'ambos'])
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [])

  async function carregar() {
    setLoading(true)
    const [{ data: mp }, { data: comprasData }, { data: custosData }] = await Promise.all([
      supabase.from('financeiro_materias_primas').select('*').eq('id', materiaId).single(),
      supabase
        .from('financeiro_lancamento_itens')
        .select('*, lancamento:financeiro_lancamentos(data_lancamento, status, parte:financeiro_partes!parte_id(nome))')
        .eq('materia_prima_id', materiaId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('financeiro_custo_medio_mensal')
        .select('*')
        .eq('materia_prima_id', materiaId)
        .order('mes_referencia', { ascending: false }),
    ])
    setMateria(mp)
    setCompras((comprasData || []).filter((c: any) => c.lancamento?.status !== 'cancelado'))
    setCustosMensais(custosData || [])
    setLoading(false)
  }

  async function salvar() {
    if (!materia) return
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_materias_primas')
        .update({
          unidade_medida: materia.unidade_medida,
          unidade_compra: materia.unidade_compra,
          fator_conversao: materia.fator_conversao,
          conta_id: materia.conta_id || null,
          descricao: materia.descricao || null,
          ativo: materia.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', materiaId)
      if (error) throw error
      router.push('/financeiro/materias-primas')
    } catch (err: any) {
      console.error('Erro ao salvar matéria-prima:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
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

  if (!materia) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Não encontrado</div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">{materia.nome}</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Cadastro</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade de compra</label>
                <input
                  type="text"
                  value={materia.unidade_compra}
                  onChange={(e) => setMateria({ ...materia, unidade_compra: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade da ficha técnica</label>
                <input
                  type="text"
                  value={materia.unidade_medida}
                  onChange={(e) => setMateria({ ...materia, unidade_medida: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fator de conversão</label>
              <input
                type="number"
                step="any"
                value={materia.fator_conversao}
                onChange={(e) => setMateria({ ...materia, fator_conversao: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Conta contábil do item</label>
              <select
                value={materia.conta_id || ''}
                onChange={(e) => setMateria({ ...materia, conta_id: e.target.value || undefined })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
              >
                <option value="">Não definida</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Novas compras deste item herdam essa conta; as já lançadas não mudam.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
              <textarea
                value={materia.descricao || ''}
                onChange={(e) => setMateria({ ...materia, descricao: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={materia.ativo}
                onChange={(e) => setMateria({ ...materia, ativo: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Ativo
            </label>
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-4">Custo médio por mês</h2>
            {custosMensais.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma compra registrada ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-3">Mês</th>
                      <th className="py-2 pr-3">Qtd. ({materia.unidade_medida})</th>
                      <th className="py-2 pr-3">Total gasto</th>
                      <th className="py-2 pr-3">Custo médio/{materia.unidade_medida}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {custosMensais.map((c) => (
                      <tr key={c.mes_referencia} className="border-b border-gray-100">
                        <td className="py-2 pr-3 font-medium text-gray-800">
                          {new Date(c.mes_referencia + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">{c.quantidade_convertida}</td>
                        <td className="py-2 pr-3 text-gray-600">{formatBRL(c.valor_total)}</td>
                        <td className="py-2 pr-3 text-gray-600">{formatBRL(c.custo_medio_por_unidade_medida)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-4">Últimas compras</h2>
            {compras.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma compra registrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {compras.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{c.lancamento?.parte?.nome || 'Fornecedor'}</p>
                      <p className="text-xs text-gray-500">
                        {c.lancamento?.data_lancamento
                          ? new Date(c.lancamento.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')
                          : '—'}{' '}
                        · {c.quantidade} {c.unidade_nota}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-800">{formatBRL(c.valor_total)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
