'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import NovaReceitaDinheiroModal from '@/components/NovaReceitaDinheiroModal'
import { buscarFluxoCaixaMensal, FluxoCaixaMensal } from '@/lib/financeiro-receitas'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader, Plus, AlertCircle } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export default function FluxoCaixaPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const hoje = new Date()
  const [unidade, setUnidade] = useState<'loja1' | 'loja2'>('loja1')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1) // 1-based
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<FluxoCaixaMensal | null>(null)
  const [mostrarNovaReceita, setMostrarNovaReceita] = useState(false)

  useEffect(() => {
    carregar()
  }, [unidade, ano, mes])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const resultado = await buscarFluxoCaixaMensal(unidade, ano, mes)
      setDados(resultado)
    } catch (err: any) {
      console.error('Erro ao carregar fluxo de caixa:', err)
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
            {(['loja1', 'loja2'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnidade(u)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                  unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {UNIDADE_LABEL[u]}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">
              {MESES[mes - 1]} de {ano}
            </p>
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

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Este saldo não inclui despesas de rateio/cozinha (custos compartilhados entre lojas) —
                  só o que está lançado diretamente nesta unidade.
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Entradas por categoria
                </p>
                <div className="divide-y divide-gray-100">
                  {dados.entradasPorCategoria.map((c) => (
                    <div key={c.categoria} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">{c.label}</span>
                      <span className={c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}>
                        {formatBRL(c.valor)}
                      </span>
                    </div>
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
                      <div key={g.grupoDre} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="text-gray-600">{g.grupoDre}</span>
                        <span className="font-semibold text-gray-800">{formatBRL(g.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {mostrarNovaReceita && usuario && (
          <NovaReceitaDinheiroModal
            unidadeInicial={unidade}
            usuarioId={usuario.id}
            onClose={() => setMostrarNovaReceita(false)}
            onCriada={carregar}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
