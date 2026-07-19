'use client'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import ConciliarExtratoTab from '@/components/ConciliarExtratoTab'
import FluxoMensalTabela from '@/components/FluxoMensalTabela'
import FluxoMensalDrilldownModal, { LinhaDrilldown } from '@/components/FluxoMensalDrilldownModal'
import OrcamentoEditorModal from '@/components/OrcamentoEditorModal'
import NovaReceitaDinheiroModal from '@/components/NovaReceitaDinheiroModal'
import { buscarFluxoMensal, buscarAtrasados, FluxoMensalResultado, FluxoMensalAtrasados, VisaoFluxoMensal } from '@/lib/financeiro-fluxo-mensal'
import { Cenario } from '@/lib/financeiro-forecast'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader, AlertCircle, Settings, Plus } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const VISAO_LABEL: Record<VisaoFluxoMensal, string> = {
  loja1: UNIDADE_LABEL.loja1,
  loja2: UNIDADE_LABEL.loja2,
  rateio: UNIDADE_LABEL.rateio,
  consolidado: 'Consolidado',
}

const CENARIO_LABEL: Record<Cenario, string> = { pessimista: 'Pessimista', moderado: 'Moderado', otimista: 'Otimista' }

type Aba = 'mensal' | 'extrato'

function FluxoCaixaContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const hoje = new Date()

  const [aba, setAba] = useState<Aba>(params.get('tab') === 'extrato' ? 'extrato' : 'mensal')
  const [unidade, setUnidade] = useState<VisaoFluxoMensal>('consolidado')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [cenario, setCenario] = useState<Cenario>('moderado')

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<FluxoMensalResultado | null>(null)
  const [atrasados, setAtrasados] = useState<FluxoMensalAtrasados | null>(null)
  const [modalDrilldown, setModalDrilldown] = useState<{ titulo: string; linhas: LinhaDrilldown[] } | null>(null)
  const [modalOrcamento, setModalOrcamento] = useState(false)
  const [modalNovaReceita, setModalNovaReceita] = useState(false)

  useEffect(() => {
    if (aba === 'mensal') carregar()
  }, [aba, unidade, ano, mes, cenario])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const [resultado, atrasadosResultado] = await Promise.all([
        buscarFluxoMensal(unidade, ano, mes, cenario),
        buscarAtrasados(unidade),
      ])
      setDados(resultado)
      setAtrasados(atrasadosResultado)
    } catch (err: any) {
      console.error('Erro ao carregar fluxo de caixa mensal:', err)
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

  const totalSaidas = dados ? dados.totalSaidasFixo + dados.totalSaidasVariavel : 0
  const saldoFinal = dados ? dados.saldoAcumuladoPorDia[dados.saldoAcumuladoPorDia.length - 1] || 0 : 0

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Fluxo de Caixa</h1>
            </div>
            {aba === 'mensal' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setModalNovaReceita(true)}
                  className="bg-green-700 text-white rounded-lg px-3 py-2 font-semibold flex items-center gap-1.5 hover:bg-green-800 text-sm"
                >
                  <Plus size={16} /> Dinheiro
                </button>
                <button
                  onClick={() => setModalOrcamento(true)}
                  className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800 text-sm"
                >
                  <Settings size={16} /> Orçamento
                </button>
              </div>
            )}
          </div>
          <div className="max-w-5xl mx-auto px-4 flex gap-1">
            {(['mensal', 'extrato'] as Aba[]).map((a) => (
              <button
                key={a}
                onClick={() => setAba(a)}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${
                  aba === a ? 'border-pink-600 text-pink-700' : 'border-transparent text-gray-500'
                }`}
              >
                {a === 'mensal' ? 'Visão Mensal' : 'Conciliar Extrato'}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6">
          {aba === 'extrato' ? (
            <ConciliarExtratoTab />
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {(['loja1', 'loja2', 'rateio', 'consolidado'] as VisaoFluxoMensal[]).map((u) => (
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

              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                    <ChevronLeft size={20} className="text-gray-600" />
                  </button>
                  <p className="text-lg font-semibold text-gray-800 min-w-[160px] text-center">{MESES[mes - 1]} de {ano}</p>
                  <button onClick={proximoMes} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                    <ChevronRight size={20} className="text-gray-600" />
                  </button>
                </div>
                <div className="flex gap-1">
                  {(['pessimista', 'moderado', 'otimista'] as Cenario[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCenario(c)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${
                        cenario === c ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {CENARIO_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

              {loading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
                  <Loader size={20} className="animate-spin" /> Carregando...
                </div>
              ) : dados ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Entradas</p>
                      <p className="text-lg font-bold text-green-600 mt-1">{formatBRL(dados.totalEntradasCaixa)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Saídas</p>
                      <p className="text-lg font-bold text-red-600 mt-1">{formatBRL(totalSaidas)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Saldo</p>
                      <p className={`text-lg font-bold mt-1 ${saldoFinal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatBRL(saldoFinal)}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        atrasados && atrasados.itens.length > 0 &&
                        setModalDrilldown({
                          titulo: 'Atrasados (hoje)',
                          linhas: atrasados.itens.map((i) => ({ label: `${i.parteNome} — ${i.diasAtraso}d`, valor: i.valor })),
                        })
                      }
                      disabled={!atrasados || atrasados.itens.length === 0}
                      className="bg-white rounded-xl p-4 border border-gray-100 text-left hover:shadow-md transition-shadow disabled:hover:shadow-none"
                    >
                      <p className="text-xs text-gray-500 uppercase font-semibold">Atrasados</p>
                      <p className="text-lg font-bold text-amber-600 mt-1">{formatBRL(atrasados?.total || 0)}</p>
                      <p className="text-[10px] text-gray-400">{atrasados?.quantidade || 0} lançamento(s) — hoje</p>
                    </button>
                  </div>

                  {!dados.faturamentoAplicavel && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs text-blue-800">
                      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>Faturamento e Meta de Venda não se aplicam ao rateio — ele não vende, só recebe custo.</span>
                    </div>
                  )}

                  <FluxoMensalTabela dados={dados} onAbrirDrilldown={(titulo, linhas) => setModalDrilldown({ titulo, linhas })} />
                </>
              ) : null}
            </>
          )}
        </div>

        {modalDrilldown && (
          <FluxoMensalDrilldownModal titulo={modalDrilldown.titulo} linhas={modalDrilldown.linhas} onClose={() => setModalDrilldown(null)} />
        )}

        {modalOrcamento && usuario && (
          <OrcamentoEditorModal
            ano={ano}
            mes={mes}
            unidadeInicial={unidade === 'consolidado' ? 'loja1' : unidade}
            usuarioId={usuario.id}
            onClose={() => setModalOrcamento(false)}
            onSalvo={carregar}
          />
        )}

        {modalNovaReceita && usuario && (
          <NovaReceitaDinheiroModal
            unidadeInicial={unidade === 'loja2' ? 'loja2' : 'loja1'}
            usuarioId={usuario.id}
            onClose={() => setModalNovaReceita(false)}
            onCriada={carregar}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}

export default function FluxoCaixaPage() {
  return (
    <Suspense>
      <FluxoCaixaContent />
    </Suspense>
  )
}
