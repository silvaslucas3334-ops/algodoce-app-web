'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import DreDetalheModal from '@/components/DreDetalheModal'
import { buscarDre, DreResultado, VisaoDre } from '@/lib/financeiro-dre'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader, AlertCircle } from 'lucide-react'
import { CategoriaReceita } from '@/lib/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const VISAO_LABEL: Record<VisaoDre, string> = {
  loja1: UNIDADE_LABEL.loja1,
  loja2: UNIDADE_LABEL.loja2,
  consolidado: 'Consolidado',
}

type ModalDetalhe =
  | { tipo: 'receita'; titulo: string; categoria: CategoriaReceita }
  | { tipo: 'insumo'; titulo: string; grupoDre: string }
  | { tipo: 'despesa'; titulo: string; grupoDre: string }

export default function DrePage() {
  const router = useRouter()
  const hoje = new Date()

  const [unidade, setUnidade] = useState<VisaoDre>('loja1')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DreResultado | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<ModalDetalhe | null>(null)

  useEffect(() => {
    carregar()
  }, [unidade, ano, mes])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const resultado = await buscarDre(unidade, ano, mes)
      setDados(resultado)
    } catch (err: any) {
      console.error('Erro ao carregar DRE:', err)
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

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">DRE</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-4">
            {(['loja1', 'loja2', 'consolidado'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnidade(u)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                  unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {VISAO_LABEL[u]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">{MESES[mes - 1]} de {ano}</p>
            <button onClick={proximoMes} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : dados ? (
            <>
              <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">Resultado do mês</p>
                <p className={`text-2xl font-bold mt-1 ${dados.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBRL(dados.resultado)}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-start gap-2 text-xs text-blue-800">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  "Custo de Insumos Comprados" é o valor das notas de compra no mês de competência — não é CMV real
                  (não desconta estoque nem considera o que foi de fato consumido/vendido).
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Competência de lançamentos antigos (antes desta funcionalidade) é aproximada pela data de
                  lançamento/pagamento — só despesas recorrentes configuradas depois têm competência deslocada de verdade.
                  {unidade !== 'consolidado' && dados.percentualRateio != null && (
                    <> Rateio aplicado: {(dados.percentualRateio * 100).toFixed(1)}% das despesas de rateio/cozinha do mês, proporcional ao faturamento — se uma loja lançar menos vendas em dinheiro que a outra, essa proporção fica distorcida.</>
                  )}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Receita Bruta — {formatBRL(dados.totalReceitaBruta)}
                </p>
                <div className="divide-y divide-gray-100">
                  {dados.receitaBrutaPorCategoria.map((c) => (
                    <button
                      key={c.categoria}
                      onClick={() => setModalDetalhe({ tipo: 'receita', titulo: c.label, categoria: c.categoria })}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                    >
                      <span className="text-gray-600">{c.label}</span>
                      <span className={c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}>{formatBRL(c.valor)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {dados.taxasDescontadas.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                  <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                    (−) Taxas descontadas no repasse — {formatBRL(dados.totalTaxasDescontadas)}
                  </p>
                  <div className="divide-y divide-gray-100">
                    {dados.taxasDescontadas.map((t) => (
                      <div key={t.label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-gray-600">{t.label}</span>
                        <span className="font-semibold text-gray-800">{formatBRL(t.valor)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
                    Nunca sai como pagamento separado — já vem descontada do que caiu no banco. Não aparece no Fluxo de Caixa.
                  </p>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  (−) Custo de Insumos Comprados — {formatBRL(dados.totalCustoInsumos)}
                </p>
                {dados.custoInsumosPorGrupoDre.length === 0 ? (
                  <p className="text-sm text-gray-400 px-4 py-4">Nenhuma compra de insumo neste período.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {dados.custoInsumosPorGrupoDre.map((g) => (
                      <button
                        key={g.grupoDre}
                        onClick={() => setModalDetalhe({ tipo: 'insumo', titulo: g.grupoDre, grupoDre: g.grupoDre })}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                      >
                        <span className="text-gray-600">{g.grupoDre}</span>
                        <span className="font-semibold text-gray-800">{formatBRL(g.valor)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  (−) Despesas por grupo — {formatBRL(dados.totalDespesas)}
                </p>
                {dados.despesasPorGrupoDre.length === 0 ? (
                  <p className="text-sm text-gray-400 px-4 py-4">Nenhuma despesa neste período.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {dados.despesasPorGrupoDre.map((g) => (
                      <button
                        key={g.grupoDre}
                        onClick={() => setModalDetalhe({ tipo: 'despesa', titulo: g.grupoDre, grupoDre: g.grupoDre })}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                      >
                        <span className="text-gray-600">{g.grupoDre}</span>
                        <span className="font-semibold text-gray-800">{formatBRL(g.valor)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {modalDetalhe && dados && (
          <DreDetalheModal
            tipo={modalDetalhe.tipo}
            titulo={modalDetalhe.titulo}
            receitas={
              modalDetalhe.tipo === 'receita'
                ? dados.receitasDetalhadas.filter((r) => r.categoria === modalDetalhe.categoria)
                : undefined
            }
            linhas={
              modalDetalhe.tipo === 'insumo'
                ? dados.custoInsumosDetalhados.filter((i) => i.grupoDre === modalDetalhe.grupoDre)
                : modalDetalhe.tipo === 'despesa'
                  ? dados.despesasDetalhadas.filter((d) => d.grupoDre === modalDetalhe.grupoDre)
                  : undefined
            }
            onClose={() => setModalDetalhe(null)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
