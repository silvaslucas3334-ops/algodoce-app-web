'use client'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import NovaReceitaDinheiroModal from '@/components/NovaReceitaDinheiroModal'
import FluxoCaixaDetalheModal from '@/components/FluxoCaixaDetalheModal'
import { buscarFluxoCaixa, FluxoCaixaMensal, VisaoFluxoCaixa } from '@/lib/financeiro-receitas'
import { formatBRL } from '@/lib/ofx'
import { hojeISO, somarDias } from '@/lib/financeiro-utils'
import { UNIDADE_LABEL } from '@/lib/constants'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader, Plus, AlertCircle } from 'lucide-react'
import { CategoriaReceita } from '@/lib/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const VISAO_LABEL: Record<VisaoFluxoCaixa, string> = {
  loja1: UNIDADE_LABEL.loja1,
  loja2: UNIDADE_LABEL.loja2,
  consolidado: 'Consolidado',
}

type ModoPeriodo = 'dia' | 'mes' | 'intervalo'
const MODO_LABEL: Record<ModoPeriodo, string> = { dia: 'Dia', mes: 'Mês', intervalo: 'Período' }

function formatarDataBR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function FluxoCaixaPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const hoje = new Date()
  const [unidade, setUnidade] = useState<VisaoFluxoCaixa>('loja1')
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('mes')

  // Modo 'dia'
  const [dataUnica, setDataUnica] = useState(hojeISO())
  // Modo 'mes' (comportamento original, preservado)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1) // 1-based
  // Modo 'intervalo'
  const [dataInicioIntervalo, setDataInicioIntervalo] = useState(hojeISO())
  const [dataFimIntervalo, setDataFimIntervalo] = useState(hojeISO())

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<FluxoCaixaMensal | null>(null)
  const [mostrarNovaReceita, setMostrarNovaReceita] = useState(false)
  const [modalDetalhe, setModalDetalhe] = useState<{ tipo: 'saida' | 'entrada'; titulo: string; chave: string } | null>(null)

  const pad = (n: number) => String(n).padStart(2, '0')

  const periodo = useMemo(() => {
    if (modoPeriodo === 'dia') {
      return { inicio: dataUnica, fim: dataUnica, titulo: formatarDataBR(dataUnica) }
    }
    if (modoPeriodo === 'intervalo') {
      return {
        inicio: dataInicioIntervalo,
        fim: dataFimIntervalo,
        titulo: dataInicioIntervalo && dataFimIntervalo ? `${formatarDataBR(dataInicioIntervalo)} — ${formatarDataBR(dataFimIntervalo)}` : '',
      }
    }
    const inicio = `${ano}-${pad(mes)}-01`
    const fim = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`
    return { inicio, fim, titulo: `${MESES[mes - 1]} de ${ano}` }
  }, [modoPeriodo, dataUnica, ano, mes, dataInicioIntervalo, dataFimIntervalo])

  // Intervalo inválido (vazio ou invertido) nunca dispara busca — senão a
  // query roda "vazia" silenciosamente (gte/lte invertidos não erram, só
  // não acham nada) e parece um relatório zerado sem explicação.
  const intervaloValido =
    modoPeriodo !== 'intervalo' || (!!dataInicioIntervalo && !!dataFimIntervalo && dataInicioIntervalo <= dataFimIntervalo)
  const diasNoIntervalo =
    modoPeriodo === 'intervalo' && intervaloValido
      ? Math.round((new Date(dataFimIntervalo + 'T00:00:00').getTime() - new Date(dataInicioIntervalo + 'T00:00:00').getTime()) / 86400000)
      : 0
  const intervaloLongo = diasNoIntervalo > 366

  useEffect(() => {
    if (!intervaloValido) return
    carregar()
  }, [unidade, periodo.inicio, periodo.fim])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const resultado = await buscarFluxoCaixa(unidade, periodo.inicio, periodo.fim)
      setDados(resultado)
    } catch (err: any) {
      console.error('Erro ao carregar fluxo de caixa:', err)
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  function diaAnterior() { setDataUnica(somarDias(dataUnica, -1)) }
  function proximoDia() { setDataUnica(somarDias(dataUnica, 1)) }
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
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
                <ArrowLeft size={22} />
              </button>
              <h1 className="text-xl font-bold text-gray-800">Fluxo de Caixa</h1>
            </div>
            <button
              onClick={() => setMostrarNovaReceita(true)}
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Nova Receita em Dinheiro
            </button>
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

          <div className="flex gap-2 mb-4">
            {(['dia', 'mes', 'intervalo'] as ModoPeriodo[]).map((m) => (
              <button
                key={m}
                onClick={() => setModoPeriodo(m)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  modoPeriodo === m ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {MODO_LABEL[m]}
              </button>
            ))}
          </div>

          {modoPeriodo === 'mes' && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">{periodo.titulo}</p>
              <button onClick={proximoMes} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>
          )}

          {modoPeriodo === 'dia' && (
            <div className="flex items-center justify-center gap-3 mb-6">
              <button onClick={diaAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <input
                type="date"
                value={dataUnica}
                onChange={(e) => setDataUnica(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={proximoDia} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>
          )}

          {modoPeriodo === 'intervalo' && (
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
                  <input
                    type="date"
                    value={dataInicioIntervalo}
                    onChange={(e) => setDataInicioIntervalo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Até</label>
                  <input
                    type="date"
                    value={dataFimIntervalo}
                    onChange={(e) => setDataFimIntervalo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {!intervaloValido && (
                <p className="text-xs text-red-600">A data final precisa ser igual ou depois da data inicial.</p>
              )}
              {intervaloValido && intervaloLongo && (
                <p className="text-xs text-amber-600">Período longo ({diasNoIntervalo} dias) — a busca pode demorar um pouco.</p>
              )}
            </div>
          )}

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {!intervaloValido ? null : loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : dados ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Entradas</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{formatBRL(dados.totalEntradas)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Saídas</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{formatBRL(dados.totalSaidas)}</p>
                </div>
                <div className="bg-white rounded-xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Saldo</p>
                  <p className={`text-xl font-bold mt-1 ${dados.saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatBRL(dados.saldo)}
                  </p>
                </div>
              </div>

              {unidade === 'consolidado' ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-blue-800">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Visão da empresa toda: soma Paraisópolis + Itajubá + despesas de rateio/cozinha. Em regime de
                    caixa o rateio não fica de fora — o dinheiro sai de alguma conta de qualquer forma.
                  </span>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-amber-800">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Este saldo não inclui despesas de rateio/cozinha (custos compartilhados entre lojas) — só o
                    que está lançado diretamente nesta unidade. Veja "Consolidado" pra incluir tudo.
                  </span>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Entradas por categoria
                </p>
                <div className="divide-y divide-gray-100">
                  {dados.entradasPorCategoria.map((c) => (
                    <button
                      key={c.categoria}
                      onClick={() => setModalDetalhe({ tipo: 'entrada', titulo: c.label, chave: c.categoria })}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                    >
                      <span className="text-gray-600">{c.label}</span>
                      <span className={c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}>
                        {formatBRL(c.valor)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Saídas por grupo
                </p>
                {dados.saidasPorGrupoDre.length === 0 ? (
                  <p className="text-sm text-gray-400 px-4 py-4">Nenhuma despesa paga neste período.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {dados.saidasPorGrupoDre.map((g) => (
                      <button
                        key={g.grupoDre}
                        onClick={() => setModalDetalhe({ tipo: 'saida', titulo: g.grupoDre, chave: g.grupoDre })}
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

        {mostrarNovaReceita && usuario && (
          <NovaReceitaDinheiroModal
            unidadeInicial={unidade === 'consolidado' ? 'loja1' : unidade}
            usuarioId={usuario.id}
            onClose={() => setMostrarNovaReceita(false)}
            onCriada={carregar}
          />
        )}

        {modalDetalhe && dados && (
          <FluxoCaixaDetalheModal
            tipo={modalDetalhe.tipo}
            titulo={modalDetalhe.titulo}
            despesas={
              modalDetalhe.tipo === 'saida'
                ? dados.despesasDetalhadas.filter((d) => d.grupoDre === modalDetalhe.chave)
                : undefined
            }
            receitas={
              modalDetalhe.tipo === 'entrada'
                ? dados.receitasDetalhadas.filter((r) => r.categoria === (modalDetalhe.chave as CategoriaReceita))
                : undefined
            }
            onClose={() => setModalDetalhe(null)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
