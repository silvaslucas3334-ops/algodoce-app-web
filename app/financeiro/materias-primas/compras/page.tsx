'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import { ChevronLeft, ChevronRight, Loader } from 'lucide-react'
import { FinanceiroMateriaPrima, FinanceiroParte } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import {
  buscarComprasRelatorio,
  resumirComprasRelatorio,
  CompraItemRelatorio,
} from '@/lib/financeiro-compras-relatorio'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function ComprasRelatorioPage() {
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [materiaPrimaId, setMateriaPrimaId] = useState('')
  const [parteId, setParteId] = useState('')

  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])
  const [itens, setItens] = useState<CompraItemRelatorio[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('financeiro_materias_primas').select('id, nome, unidade_medida, unidade_compra, fator_conversao').order('nome')
      .then(({ data }) => setMaterias((data || []) as FinanceiroMateriaPrima[]))
    supabase.from('financeiro_partes').select('*').eq('papel_fornecedor', true).eq('ativo', true).order('nome')
      .then(({ data }) => setFornecedores((data || []) as FinanceiroParte[]))
  }, [])

  useEffect(() => {
    carregar()
  }, [ano, mes, materiaPrimaId, parteId])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const ultimoDia = new Date(ano, mes, 0).getDate()
      const dataInicio = `${ano}-${String(mes).padStart(2, '0')}-01`
      const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
      const resultado = await buscarComprasRelatorio({
        dataInicio,
        dataFim,
        materiaPrimaId: materiaPrimaId || undefined,
        parteId: parteId || undefined,
      })
      setItens(resultado)
    } catch (err: any) {
      console.error('Erro ao carregar compras:', err)
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  function mesAnterior() {
    if (mes === 1) { setMes(12); setAno(ano - 1) } else { setMes(mes - 1) }
  }
  function proximoMes() {
    if (mes === 12) { setMes(1); setAno(ano + 1) } else { setMes(mes + 1) }
  }

  const resumo = resumirComprasRelatorio(itens, materiaPrimaId || undefined)

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Compras" backHref="/financeiro/materias-primas" maxWidth="max-w-4xl" />

        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-xs text-gray-500 mb-4">
            Todas as compras de insumos do mês, item por item — filtre por matéria-prima pra ver quanto comprou e a que preço.
          </p>

          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">{MESES[mes - 1]} de {ano}</p>
            <button onClick={proximoMes} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <select
              value={materiaPrimaId}
              onChange={(e) => setMateriaPrimaId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Todas as matérias-primas</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            <select
              value={parteId}
              onChange={(e) => setParteId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : itens.length === 0 ? (
            <EmptyState title="Nenhuma compra neste filtro" description="Ajuste o mês ou os filtros acima pra ver as compras registradas." />
          ) : (
            <>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-wrap gap-6 mb-4">
                {resumo.quantidadeTotal != null && (
                  <div>
                    <p className="text-xs text-gray-500">Quantidade total</p>
                    <p className="text-lg font-bold text-gray-900">
                      {resumo.quantidadeTotal.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} {resumo.unidadeMedida}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500">Valor total</p>
                  <p className="text-lg font-bold text-gray-900">{formatBRL(resumo.valorTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Nº de compras</p>
                  <p className="text-lg font-bold text-gray-900">{resumo.numeroCompras}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3">Data</th>
                      <th className="py-2 px-3">Matéria-prima</th>
                      <th className="py-2 px-3">Fornecedor</th>
                      <th className="py-2 px-3">Quantidade</th>
                      <th className="py-2 px-3">Valor unitário</th>
                      <th className="py-2 px-3">Valor total</th>
                      <th className="py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                          {new Date(item.dataLancamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-2 px-3 font-medium text-gray-800">{item.materiaPrimaNome}</td>
                        <td className="py-2 px-3 text-gray-600">{item.fornecedorNome}</td>
                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{item.quantidade} {item.unidadeNota}</td>
                        <td className="py-2 px-3 text-gray-600">{formatBRL(item.valorUnitario)}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{formatBRL(item.valorTotal)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <Link href={`/financeiro/despesas/${item.lancamentoId}`} className="text-pink-700 hover:underline text-xs font-medium">
                            Ver nota
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
