'use client'
import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Package, CheckCircle, ArrowRightLeft, History, LayoutDashboard } from 'lucide-react'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import RomaneioCard, { ChipUnidade } from '@/components/RomaneioCard'
import { LOCAL_LABEL } from '@/lib/constants'
import { hojeISO, somarDias } from '@/lib/financeiro-utils'
import { carregarRomaneiosAtivos, enriquecerRomaneios, RomaneioBase, RomaneioEnriquecido, Unidade, UNIDADES } from '@/lib/expedicao'

const ABAS_VALIDAS = ['geral', 'envios', 'devolucoes', 'recebimentos', 'transferencias', 'historico']

// Quantos dias um romaneio enviado pode ficar sem ser recebido antes de aparecer em "Parados".
const DIAS_PARADO = 2

type FiltroLoja = 'todas' | Unidade

function hrefDetalhe(r: RomaneioEnriquecido): string {
  return r.tipo === 'transferencia' ? `/expedicao/transferencia/${r.id}` : `/expedicao/${r.id}`
}

function VazioLista({ icone: Icone, texto }: { icone: typeof Package; texto: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
      <Icone size={40} className="mx-auto text-gray-300 mb-3" />
      <p className="text-gray-600">{texto}</p>
    </div>
  )
}

function ExpedicaoContent() {
  const { usuario, carregando: carregandoAuth } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pronto = !carregandoAuth && !!usuario

  const papel: string | undefined = usuario?.role
  const ehAdmin = papel === 'admin'
  const ehCozinha = papel === 'cozinha'
  const ehLoja = papel === 'loja'
  const lojaDoUsuario: string | undefined = ehLoja ? usuario?.loja_id : undefined

  // Aba e loja vivem na URL (?aba=&loja=): os links do Painel Inicial
  // (/expedicao?aba=devolucoes) continuam valendo e o estado sobrevive a atualizar a página.
  const abasPermitidas = [
    ...(ehAdmin ? ['geral'] : []),
    ...(ehCozinha || ehAdmin ? ['envios', 'devolucoes'] : []),
    ...(ehLoja || ehAdmin ? ['recebimentos', 'transferencias'] : []),
    'historico',
  ]
  const abaPadrao = ehAdmin ? 'geral' : ehLoja ? 'recebimentos' : 'envios'
  const abaParam = searchParams.get('aba')
  const aba = abaParam && ABAS_VALIDAS.includes(abaParam) && abasPermitidas.includes(abaParam) ? abaParam : abaPadrao

  const lojaParam = searchParams.get('loja')
  // O filtro de loja é do admin (que vê tudo junto). Loja e cozinha já veem só o que é deles.
  const filtroLoja: FiltroLoja = ehAdmin && lojaParam && (UNIDADES as string[]).includes(lojaParam) ? (lojaParam as Unidade) : 'todas'

  const atualizarUrl = useCallback(
    (parcial: { aba?: string; loja?: FiltroLoja }) => {
      const p = new URLSearchParams(searchParams.toString())
      if (parcial.aba !== undefined) p.set('aba', parcial.aba)
      if (parcial.loja !== undefined) {
        if (parcial.loja === 'todas') p.delete('loja')
        else p.set('loja', parcial.loja)
      }
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, pathname, router]
  )

  // --- dados -----------------------------------------------------------------
  const [ativos, setAtivos] = useState<RomaneioEnriquecido[]>([])
  const [loading, setLoading] = useState(true)
  const jaCarregouRef = useRef(false)
  const [concluindoId, setConcluindoId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    // "Carregando..." só na primeira vez: recargas por realtime/ação são silenciosas.
    if (!jaCarregouRef.current) setLoading(true)
    try {
      setAtivos(await carregarRomaneiosAtivos())
      jaCarregouRef.current = true
    } catch (err) {
      console.error('Erro ao carregar romaneios:', err)
    } finally {
      setLoading(false)
    }
  }, [])
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar

  useEffect(() => {
    if (!pronto) return
    carregar()

    // Mudanças em romaneios ou em etiquetas (recebimento pelo scanner, por exemplo)
    // alteram o andamento; agrupa os eventos numa recarga só.
    let temporizador: ReturnType<typeof setTimeout> | null = null
    const agendar = () => {
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(() => { carregarRef.current() }, 800)
    }
    const channel = supabase
      .channel('expedicao-romaneios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'romaneios' }, agendar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotes_producao' }, agendar)
      .subscribe()
    return () => {
      if (temporizador) clearTimeout(temporizador)
      channel.unsubscribe()
    }
  }, [pronto, carregar])

  // Histórico — romaneios recebidos/cancelados, com filtro de data no servidor
  // pra não crescer sem limite junto com a lista de "ativos".
  const [historico, setHistorico] = useState<RomaneioEnriquecido[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [filtroStatusHistorico, setFiltroStatusHistorico] = useState<'todos' | 'em_estoque' | 'cancelado'>('todos')
  const [historicoInicio, setHistoricoInicio] = useState(somarDias(hojeISO(), -30))
  const [historicoFim, setHistoricoFim] = useState(hojeISO())

  useEffect(() => {
    if (!pronto || aba !== 'historico') return
    let cancelado = false
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
        const enriquecidos = await enriquecerRomaneios((data || []) as RomaneioBase[])
        if (!cancelado) setHistorico(enriquecidos)
      } catch (err) {
        console.error('Erro ao carregar histórico de romaneios:', err)
      } finally {
        if (!cancelado) setHistoricoLoading(false)
      }
    }
    carregarHistorico()
    return () => { cancelado = true }
  }, [pronto, aba, filtroStatusHistorico, historicoInicio, historicoFim])

  // --- filtros ---------------------------------------------------------------
  // Filtro de loja do admin: o romaneio entra se a loja escolhida é a origem OU o destino.
  const casa = (r: RomaneioEnriquecido) => filtroLoja === 'todas' || r.unidade_destino === filtroLoja || r.origem === filtroLoja

  const enviosCozinha = ativos.filter((r) => r.tipo === 'envio' && casa(r))
  // Devolução = transferência enviada à cozinha. (Antes esta lista não filtrava o destino
  // e a cozinha via — e podia "receber" — transferências entre lojas.)
  const devolucoes = ativos.filter((r) => r.tipo === 'transferencia' && r.status === 'confirmado' && r.unidade_destino === 'cozinha' && casa(r))
  const recebimentos = ativos.filter((r) => {
    if (r.status !== 'confirmado') return false
    if (ehLoja) return r.unidade_destino === lojaDoUsuario
    return (r.unidade_destino === 'loja1' || r.unidade_destino === 'loja2') && casa(r)
  })
  const transfSaindo = ativos.filter((r) => r.tipo === 'transferencia' && !!lojaDoUsuario && r.origem === lojaDoUsuario)
  const transfChegando = ativos.filter((r) => r.tipo === 'transferencia' && !!lojaDoUsuario && r.unidade_destino === lojaDoUsuario)
  const transfAdmin = ativos.filter((r) => r.tipo === 'transferencia' && casa(r))

  // Visão geral (admin)
  const confirmados = ativos.filter((r) => r.status === 'confirmado' && casa(r))
  const todoRecebido = (r: RomaneioEnriquecido) => r.etiquetasTotal > 0 && r.etiquetasPendentes === 0
  const paraConcluir = confirmados.filter(todoRecebido)
  const aCaminho = confirmados.filter((r) => !todoRecebido(r))
  const parados = aCaminho.filter((r) => (r.idadeDias ?? 0) >= DIAS_PARADO).sort((a, b) => (b.idadeDias ?? 0) - (a.idadeDias ?? 0))
  const idsParados = new Set(parados.map((r) => r.id))
  const emTransitoNormal = aCaminho.filter((r) => !idsParados.has(r.id))
  const rascunhos = ativos.filter((r) => r.status === 'rascunho' && casa(r))

  // Conclui um romaneio que ficou aberto mesmo com todas as etiquetas já recebidas
  // (ex.: recebimento etiqueta a etiqueta pelo scanner nunca fecha o romaneio).
  async function concluir(r: RomaneioEnriquecido) {
    if (!window.confirm('Concluir este romaneio? Todas as etiquetas dele já foram recebidas; ele deixa de aparecer como pendente.')) return
    setConcluindoId(r.id)
    try {
      // Reconfere no banco: a lista pode estar desatualizada.
      const ids = (r.linhas || []).flatMap((l: any) => l.etiquetas_selecionadas || [])
      if (ids.length > 0) {
        const { count } = await supabase.from('lotes_producao').select('id', { count: 'exact', head: true }).in('id', ids).eq('status', 'enviado')
        if ((count || 0) > 0) {
          alert('Ainda há etiquetas a caminho neste romaneio. Atualize a tela.')
          await carregar()
          return
        }
      }
      const { error } = await supabase
        .from('romaneios')
        .update({ status: 'em_estoque', atualizado_em: new Date().toISOString() })
        .eq('id', r.id)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      console.error('Erro ao concluir romaneio:', err)
      alert('Erro ao concluir: ' + (err?.message || 'desconhecido'))
    } finally {
      setConcluindoId(null)
    }
  }

  const botaoReceber = (href: string) => (
    <Link href={href} className="inline-block bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 font-semibold text-sm">
      Receber
    </Link>
  )

  const renderLista = (lista: RomaneioEnriquecido[], opcoes: { href?: (r: RomaneioEnriquecido) => string; receberHref?: (r: RomaneioEnriquecido) => string; andamento?: boolean; concluir?: boolean }) => (
    <div className="space-y-3">
      {lista.map((r) => (
        <RomaneioCard
          key={r.id}
          romaneio={r}
          href={opcoes.href?.(r)}
          acao={opcoes.receberHref ? botaoReceber(opcoes.receberHref(r)) : undefined}
          mostrarAndamento={opcoes.andamento}
          onConcluir={opcoes.concluir ? () => concluir(r) : undefined}
          concluindo={concluindoId === r.id}
        />
      ))}
    </div>
  )

  const classeAba = (chave: string) =>
    `px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
      aba === chave ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-800'
    }`

  // Enquanto o login não termina não dá pra saber o papel — não desenhar abas de outro perfil.
  if (!pronto) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    )
  }

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

      {/* Abas por papel. Admin vê as duas visões (cozinha + loja) e ganha a "Visão geral". */}
      <div className="bg-white border-b border-gray-200 sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4 overflow-x-auto">
            {ehAdmin && (
              <button onClick={() => atualizarUrl({ aba: 'geral' })} className={classeAba('geral')}>
                <LayoutDashboard size={18} /> Visão geral
              </button>
            )}
            {(ehCozinha || ehAdmin) && (
              <>
                <button onClick={() => atualizarUrl({ aba: 'envios' })} className={classeAba('envios')}>
                  📦 Envios
                </button>
                <button onClick={() => atualizarUrl({ aba: 'devolucoes' })} className={classeAba('devolucoes')}>
                  <ArrowRightLeft size={18} /> Devoluções Recebidas
                </button>
              </>
            )}
            {(ehLoja || ehAdmin) && (
              <>
                <button onClick={() => atualizarUrl({ aba: 'recebimentos' })} className={classeAba('recebimentos')}>
                  📥 Recebimentos
                </button>
                <button onClick={() => atualizarUrl({ aba: 'transferencias' })} className={classeAba('transferencias')}>
                  <ArrowRightLeft size={18} /> Transferências
                </button>
              </>
            )}
            <button onClick={() => atualizarUrl({ aba: 'historico' })} className={classeAba('historico')}>
              <History size={18} /> Histórico
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Filtro de loja do admin — vale pra todas as abas, no lugar dos seletores soltos de cada aba */}
        {ehAdmin && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Unidade</span>
            {(['todas', 'loja1', 'loja2', 'cozinha'] as FiltroLoja[]).map((u) => (
              <button
                key={u}
                onClick={() => atualizarUrl({ loja: u })}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                  filtroLoja === u ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {u === 'todas' ? 'Todas' : LOCAL_LABEL[u]}
              </button>
            ))}
          </div>
        )}

        {/* ADMIN - VISÃO GERAL */}
        {ehAdmin && aba === 'geral' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500 font-medium">A caminho</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{aCaminho.length}</p>
              </div>
              <div className={`rounded-lg border p-3 ${parados.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-medium ${parados.length > 0 ? 'text-red-700' : 'text-gray-500'}`}>Parados há {DIAS_PARADO}+ dias</p>
                <p className={`text-2xl font-bold mt-1 ${parados.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>{parados.length}</p>
              </div>
              <div className={`rounded-lg border p-3 ${paraConcluir.length > 0 ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-xs font-medium ${paraConcluir.length > 0 ? 'text-green-700' : 'text-gray-500'}`}>Já recebidos, falta concluir</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{paraConcluir.length}</p>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500 font-medium">Rascunhos (não enviados)</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{rascunhos.length}</p>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : confirmados.length === 0 && rascunhos.length === 0 ? (
              <VazioLista icone={CheckCircle} texto="Nada pendente na Expedição" />
            ) : (
              <div className="space-y-7">
                {parados.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-red-700 mb-3">Parados há {DIAS_PARADO} dias ou mais</h2>
                    {renderLista(parados, { href: hrefDetalhe, andamento: true })}
                  </section>
                )}

                {paraConcluir.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-green-700 mb-1">Já recebidos, falta concluir</h2>
                    <p className="text-sm text-gray-500 mb-3">
                      Todas as etiquetas destes romaneios já foram recebidas (por exemplo, pelo Scanner), mas eles ficaram abertos e continuam contando como pendentes.
                    </p>
                    {renderLista(paraConcluir, { href: hrefDetalhe, andamento: true, concluir: true })}
                  </section>
                )}

                {emTransitoNormal.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-gray-800 mb-3">A caminho</h2>
                    <div className="space-y-5">
                      {(['loja1', 'loja2', 'cozinha'] as Unidade[]).map((destino) => {
                        const doDestino = emTransitoNormal.filter((r) => r.unidade_destino === destino)
                        if (doDestino.length === 0) return null
                        return (
                          <div key={destino}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm text-gray-500">Indo para</span>
                              <ChipUnidade unidade={destino} />
                              <span className="text-xs text-gray-400">{doDestino.length}</span>
                            </div>
                            {renderLista(doDestino, { href: hrefDetalhe, andamento: true })}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {rascunhos.length > 0 && (
                  <section>
                    <h2 className="text-lg font-bold text-gray-800 mb-1">Rascunhos</h2>
                    <p className="text-sm text-gray-500 mb-3">Criados e ainda não enviados — as etiquetas continuam no estoque de origem.</p>
                    {renderLista(rascunhos, { href: hrefDetalhe })}
                  </section>
                )}
              </div>
            )}
          </>
        )}

        {/* COZINHA/ADMIN - ENVIOS */}
        {(ehCozinha || ehAdmin) && aba === 'envios' && (
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
              <VazioLista icone={Package} texto="Nenhum envio aberto" />
            ) : (
              renderLista(enviosCozinha, { href: hrefDetalhe, andamento: true })
            )}
          </>
        )}

        {/* COZINHA/ADMIN - DEVOLUÇÕES RECEBIDAS */}
        {(ehCozinha || ehAdmin) && aba === 'devolucoes' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Devoluções Recebidas</h2>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : devolucoes.length === 0 ? (
              <VazioLista icone={CheckCircle} texto="Nenhuma devolução pendente de recebimento" />
            ) : (
              renderLista(devolucoes, { receberHref: (r) => `/expedicao/receber-transferencia/${r.id}`, andamento: true })
            )}
          </>
        )}

        {/* LOJA/ADMIN - RECEBIMENTOS */}
        {(ehLoja || ehAdmin) && aba === 'recebimentos' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Recebimentos Pendentes</h2>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : recebimentos.length === 0 ? (
              <VazioLista icone={CheckCircle} texto="Nenhum envio pendente de recebimento" />
            ) : (
              renderLista(recebimentos, { receberHref: (r) => `/expedicao/receber/${r.id}`, andamento: true, concluir: true })
            )}
          </>
        )}

        {/* LOJA/ADMIN - TRANSFERÊNCIAS */}
        {(ehLoja || ehAdmin) && aba === 'transferencias' && (
          <>
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-gray-800">Transferências</h2>
              <button
                onClick={() => router.push('/expedicao/nova-transferencia')}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-blue-700 font-semibold"
              >
                <Plus size={18} /> Nova Transferência
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : ehLoja ? (
              <div className="space-y-7">
                <section>
                  <h3 className="text-base font-bold text-gray-800 mb-3">Saindo desta loja</h3>
                  {transfSaindo.length === 0 ? (
                    <VazioLista icone={Package} texto="Nenhuma transferência saindo desta loja" />
                  ) : (
                    renderLista(transfSaindo, { href: hrefDetalhe, andamento: true })
                  )}
                </section>
                <section>
                  <h3 className="text-base font-bold text-gray-800 mb-3">Chegando nesta loja</h3>
                  {transfChegando.length === 0 ? (
                    <VazioLista icone={Package} texto="Nenhuma transferência chegando" />
                  ) : (
                    renderLista(transfChegando, { href: hrefDetalhe, andamento: true })
                  )}
                </section>
              </div>
            ) : transfAdmin.length === 0 ? (
              <VazioLista icone={Package} texto="Nenhuma transferência aberta" />
            ) : (
              renderLista(transfAdmin, { href: hrefDetalhe, andamento: true })
            )}
          </>
        )}

        {/* HISTÓRICO - comum a todo mundo (romaneios recebidos/cancelados) */}
        {aba === 'historico' && (
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
            ) : historico.filter(casa).length === 0 ? (
              <VazioLista icone={History} texto="Nenhum romaneio nesse período/filtro" />
            ) : (
              renderLista(historico.filter(casa), { href: hrefDetalhe })
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
