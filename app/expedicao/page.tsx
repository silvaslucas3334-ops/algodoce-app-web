'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, ChevronRight, Package, CheckCircle, AlertCircle, ArrowRightLeft, History } from 'lucide-react'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import { ROMANEIO_STATUS_LABEL } from '@/lib/constants'
import { hojeISO, somarDias } from '@/lib/financeiro-utils'

const UNIDADE_LOJA_LABEL: Record<string, string> = { loja1: 'Paraisópolis', loja2: 'Itajubá' }

const ABAS_VALIDAS = ['envios', 'devolucoes', 'recebimentos', 'transferencias', 'historico']

function ExpedicaoContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [romaneios, setRomaneios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [abaPrincipal, setAbaPrincipal] = useState<string>('envios')
  // Admin não tem loja_id própria — precisa escolher qual unidade ver na
  // visão de Recebimentos/Transferências (que hoje é sempre da loja do usuário).
  const [unidadeAdmin, setUnidadeAdmin] = useState<'loja1' | 'loja2'>('loja1')
  const unidadeEfetiva = usuario?.role === 'admin' ? unidadeAdmin : usuario?.loja_id

  // Histórico — romaneios concluídos/cancelados, hoje escondidos sem deixar
  // rastro nenhum. Busca separada (com filtro de data no backend) pra não
  // crescer sem limite junto com a lista de "ativos".
  const [historico, setHistorico] = useState<any[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [filtroStatusHistorico, setFiltroStatusHistorico] = useState<'todos' | 'em_estoque' | 'cancelado'>('todos')
  const [historicoInicio, setHistoricoInicio] = useState(somarDias(hojeISO(), -30))
  const [historicoFim, setHistoricoFim] = useState(hojeISO())

  // Determinar aba padrão: link vindo do Painel Inicial (?aba=) tem prioridade
  // sobre o default por role, que continua sendo o fallback de sempre.
  useEffect(() => {
    const abaParam = searchParams.get('aba')
    if (abaParam && ABAS_VALIDAS.includes(abaParam)) {
      setAbaPrincipal(abaParam)
    } else if (usuario?.role === 'loja') {
      setAbaPrincipal('recebimentos')
    } else {
      setAbaPrincipal('envios')
    }
  }, [usuario?.role, searchParams])

  // Carregar romaneios
  useEffect(() => {
    carregarRomaneios()

    const channel = supabase
      .channel('romaneios-real')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'romaneios' },
        carregarRomaneios
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [abaPrincipal])

  async function carregarRomaneios() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('romaneios')
        .select('*')
        .order('data_entrega', { ascending: true })

      if (error) throw error
      setRomaneios(data || [])
    } catch (err) {
      console.error('Erro ao carregar romaneios:', err)
    } finally {
      setLoading(false)
    }
  }

  async function carregarHistorico() {
    setHistoricoLoading(true)
    try {
      let query = supabase
        .from('romaneios')
        .select('*')
        .gte('data_entrega', historicoInicio)
        .lte('data_entrega', historicoFim)
        .order('data_entrega', { ascending: false })
      if (filtroStatusHistorico === 'todos') query = query.in('status', ['em_estoque', 'cancelado'])
      else query = query.eq('status', filtroStatusHistorico)

      const { data, error } = await query
      if (error) throw error
      setHistorico(data || [])
    } catch (err) {
      console.error('Erro ao carregar histórico de romaneios:', err)
    } finally {
      setHistoricoLoading(false)
    }
  }

  useEffect(() => {
    if (abaPrincipal === 'historico') carregarHistorico()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaPrincipal, filtroStatusHistorico, historicoInicio, historicoFim])

  // Filtros para Cozinha
  const enviosCozinha = romaneios.filter(
    (r) => r.tipo === 'envio' && (r.status === 'rascunho' || r.status === 'confirmado')
  )
  const devolucoesRecebidas = romaneios.filter(
    (r) => r.tipo === 'transferencia' && r.status === 'confirmado'
  )

  // Filtros para Loja (admin escolhe a unidade via unidadeAdmin — ver unidadeEfetiva)
  const recebimentosLoja = romaneios.filter(
    (r) => r.status === 'confirmado' && r.unidade_destino === unidadeEfetiva && (r.tipo === 'envio' || r.tipo === 'transferencia')
  )
  const transferenciasLoja = romaneios.filter(
    (r) => r.tipo === 'transferencia' && (r.status === 'rascunho' || r.status === 'confirmado') && r.unidade_destino === unidadeEfetiva
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-amber-300 border-b border-amber-400 px-4 py-2 sticky top-0 z-40 shadow-md flex items-center h-20">
        <div className="flex items-center gap-4">
          <OluquinhasLogo size="md" variant="oluquinhas" color="marrom" />
          <OluquinhasLogo size="xs" variant="rosto" color="marrom" />
          <div>
            <h1 className="text-xl font-bold text-amber-900">Expedição</h1>
            <p className="text-xs text-amber-800">Gestão de Remessas</p>
          </div>
        </div>
      </div>

      {/* Abas - por role. Admin vê as duas visões (cozinha + loja), já que
          não tem uma unidade própria fixa. Histórico é comum a todo mundo. */}
      <div className="bg-white border-b border-gray-200 sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto">
            {(usuario?.role === 'cozinha' || usuario?.role === 'admin') && (
              <>
                <button
                  onClick={() => setAbaPrincipal('envios')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    abaPrincipal === 'envios'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  📦 Envios
                </button>
                <button
                  onClick={() => setAbaPrincipal('devolucoes')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    abaPrincipal === 'devolucoes'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <ArrowRightLeft size={18} /> Devoluções Recebidas
                </button>
              </>
            )}
            {(usuario?.role === 'loja' || usuario?.role === 'admin') && (
              <>
                <button
                  onClick={() => setAbaPrincipal('recebimentos')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    abaPrincipal === 'recebimentos'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  📥 Recebimentos
                </button>
                <button
                  onClick={() => setAbaPrincipal('transferencias')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    abaPrincipal === 'transferencias'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <ArrowRightLeft size={18} /> Transferências
                </button>
              </>
            )}
            <button
              onClick={() => setAbaPrincipal('historico')}
              className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                abaPrincipal === 'historico'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <History size={18} /> Histórico
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* COZINHA/ADMIN - ENVIOS */}
        {(usuario?.role === 'cozinha' || usuario?.role === 'admin') && abaPrincipal === 'envios' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Envios</h2>
              <button
                onClick={() => router.push('/expedicao/novo')}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-blue-700 font-semibold"
              >
                <Plus size={18} /> Novo Envio
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : enviosCozinha.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Package size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhum envio aberto</p>
              </div>
            ) : (
              <div className="space-y-3">
                {enviosCozinha.map((romaneio) => (
                  <Link key={romaneio.id} href={`/expedicao/${romaneio.id}`}>
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-lg font-bold text-gray-800">
                              Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${romaneio.status === 'rascunho' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {ROMANEIO_STATUS_LABEL[romaneio.status] || romaneio.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {romaneio.linhas?.length || 0} produto(s) · Criado em {new Date(romaneio.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <ChevronRight size={24} className="text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* COZINHA/ADMIN - DEVOLUÇÕES RECEBIDAS */}
        {(usuario?.role === 'cozinha' || usuario?.role === 'admin') && abaPrincipal === 'devolucoes' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Devoluções Recebidas</h2>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : devolucoesRecebidas.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhuma devolução pendente de recebimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {devolucoesRecebidas.map((romaneio) => (
                  <div key={romaneio.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-bold text-gray-800 mb-1">
                          Devolução de: {romaneio.unidade_destino === 'loja1' ? 'Paraisópolis' : 'Itajubá'}
                        </p>
                        <p className="text-sm text-gray-600">{romaneio.linhas?.length || 0} produto(s)</p>
                      </div>
                      <Link href={`/expedicao/receber-transferencia/${romaneio.id}`}>
                        <button className="bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 font-semibold">
                          Receber
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* LOJA/ADMIN - RECEBIMENTOS */}
        {(usuario?.role === 'loja' || usuario?.role === 'admin') && abaPrincipal === 'recebimentos' && (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-gray-800">Recebimentos Pendentes</h2>
              {usuario?.role === 'admin' && (
                <div className="flex gap-2">
                  {(['loja1', 'loja2'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnidadeAdmin(u)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${
                        unidadeAdmin === u ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {UNIDADE_LOJA_LABEL[u]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : recebimentosLoja.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhum envio pendente de recebimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recebimentosLoja.map((romaneio) => (
                  <div key={romaneio.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-bold text-gray-800 mb-1">
                          Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-sm text-gray-600">{romaneio.linhas?.length || 0} produto(s)</p>
                      </div>
                      <Link href={`/expedicao/receber/${romaneio.id}`}>
                        <button className="bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 font-semibold">
                          Receber
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* LOJA/ADMIN - TRANSFERÊNCIAS */}
        {(usuario?.role === 'loja' || usuario?.role === 'admin') && abaPrincipal === 'transferencias' && (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-gray-800">Transferências</h2>
              <div className="flex items-center gap-3">
                {usuario?.role === 'admin' && (
                  <div className="flex gap-2">
                    {(['loja1', 'loja2'] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setUnidadeAdmin(u)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 ${
                          unidadeAdmin === u ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        {UNIDADE_LOJA_LABEL[u]}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => router.push('/expedicao/nova-transferencia')}
                  className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-blue-700 font-semibold"
                >
                  <Plus size={18} /> Nova Transferência
                </button>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : transferenciasLoja.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Package size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhuma transferência aberta</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transferenciasLoja.map((romaneio) => (
                  <Link key={romaneio.id} href={`/expedicao/transferencia/${romaneio.id}`}>
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-lg font-bold text-gray-800">
                              Para: {romaneio.unidade_destino === 'loja1' ? 'Paraisópolis' : romaneio.unidade_destino === 'loja2' ? 'Itajubá' : 'Cozinha'}
                            </p>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${romaneio.status === 'rascunho' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {ROMANEIO_STATUS_LABEL[romaneio.status] || romaneio.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {romaneio.linhas?.length || 0} produto(s) · Criado em {new Date(romaneio.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <ChevronRight size={24} className="text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* HISTÓRICO - comum a todo mundo (romaneios recebidos/cancelados, hoje escondidos sem deixar rastro) */}
        {abaPrincipal === 'historico' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Histórico de Romaneios</h2>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(['todos', 'em_estoque', 'cancelado'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFiltroStatusHistorico(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    filtroStatusHistorico === s
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600'
                  }`}
                >
                  {s === 'todos' ? 'Todos' : s === 'em_estoque' ? 'Recebido' : 'Cancelado'}
                </button>
              ))}
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="date"
                  value={historicoInicio}
                  onChange={(e) => setHistoricoInicio(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
                <span className="text-gray-400 text-sm">até</span>
                <input
                  type="date"
                  value={historicoFim}
                  onChange={(e) => setHistoricoFim(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {historicoLoading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : historico.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <History size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhum romaneio nesse período/filtro</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historico.map((romaneio) => (
                  <Link
                    key={romaneio.id}
                    href={romaneio.tipo === 'transferencia' ? `/expedicao/transferencia/${romaneio.id}` : `/expedicao/${romaneio.id}`}
                  >
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <p className="text-lg font-bold text-gray-800">
                              {romaneio.tipo === 'transferencia' ? 'Transferência' : 'Envio'} · Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${romaneio.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {ROMANEIO_STATUS_LABEL[romaneio.status] || romaneio.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {UNIDADE_LOJA_LABEL[romaneio.unidade_destino] || 'Cozinha'} · {romaneio.linhas?.length || 0} produto(s) · Criado em{' '}
                            {new Date(romaneio.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <ChevronRight size={24} className="text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ExpedicaoPage() {
  return (
    <Suspense>
      <ExpedicaoContent />
    </Suspense>
  )
}
