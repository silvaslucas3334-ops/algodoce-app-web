'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { Tarefa, Setor, TarefaHistorico } from '@/lib/types'
import { getHoje, isAtrasada, getSetorTheme, STATUS_INFO, formatData, formatHora } from '@/lib/tarefas-utils'
import { ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, X } from 'lucide-react'

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function horaSP(ts: string): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}
function dataSP(ts: string): string {
  return new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
function fmtDiaLabel(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

function eventoDe(h: TarefaHistorico): { label: string; cor: string; detalhe?: string } {
  const j: any = h.dados_json || {}
  switch (h.alteracao_tipo) {
    case 'status_change':
      if (j.to_status === 'concluida') return { label: 'Concluída/Aprovada', cor: 'bg-green-100 text-green-700' }
      if (j.to_status === 'pronta_revisao') return { label: 'Enviada p/ revisão', cor: 'bg-blue-100 text-blue-700' }
      if (j.to_status === 'refazer_pendente') return { label: 'Marcada p/ refazer', cor: 'bg-red-100 text-red-700', detalhe: j.feedback }
      if (j.to_status === 'cancelada') return { label: 'Cancelada', cor: 'bg-gray-100 text-gray-600' }
      return { label: 'Mudança de status', cor: 'bg-gray-100 text-gray-600' }
    case 'cancelamento':
      return { label: 'Cancelada', cor: 'bg-gray-100 text-gray-600' }
    case 'reatribuicao':
      return { label: 'Reatribuída', cor: 'bg-amber-100 text-amber-700' }
    case 'edicao':
      return j.data_vencimento
        ? { label: 'Reagendada', cor: 'bg-amber-100 text-amber-700' }
        : { label: 'Editada', cor: 'bg-gray-100 text-gray-600' }
    case 'triagem':
      if (j.acao === 'reagendar') return { label: 'Reagendada', cor: 'bg-amber-100 text-amber-700', detalhe: j.para ? `para ${j.para}` : undefined }
      if (j.acao === 'cancelar') return { label: 'Cancelada', cor: 'bg-gray-100 text-gray-600' }
      if (j.acao === 'reatribuir') return { label: 'Reatribuída', cor: 'bg-amber-100 text-amber-700' }
      return { label: 'Triagem', cor: 'bg-gray-100 text-gray-600' }
    default:
      return { label: h.alteracao_tipo, cor: 'bg-gray-100 text-gray-600' }
  }
}

function DashboardContent() {
  const router = useRouter()
  const { usuario, carregando } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [historico, setHistorico] = useState<TarefaHistorico[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const hoje = getHoje()
  const [de, setDe] = useState(addDays(hoje, -6))
  const [ate, setAte] = useState(hoje)
  const [setorFiltro, setSetorFiltro] = useState('todas')
  const [diasRecolhidos, setDiasRecolhidos] = useState<Set<string>>(new Set())
  const [detalhe, setDetalhe] = useState<Tarefa | null>(null)

  useEffect(() => {
    if (!carregando && !usuario) router.replace('/login')
  }, [carregando, usuario, router])

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const [{ data: t }, { data: h }, { data: s }, { data: u }] = await Promise.all([
        supabase.from('tarefas').select('*'),
        supabase.from('tarefas_historico').select('*').order('created_at', { ascending: true }),
        supabase.from('setores').select('*').eq('ativo', true).order('nome'),
        supabase.from('usuarios').select('id, nome, role, setor_id'),
      ])
      setTarefas(t || [])
      setHistorico(h || [])
      setSetores(s || [])
      setUsuarios(u || [])
      setLoading(false)
    }
    carregar()
  }, [])

  const nomeUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nome || '—'
  const nomeSetor = (id: string) => setores.find((s) => s.id === id)?.nome || '—'

  const dias = useMemo(() => {
    const arr: string[] = []
    let d = ate
    while (d >= de) { arr.push(d); d = addDays(d, -1) }
    return arr
  }, [de, ate])

  // BLOCO A: tarefas planejadas por data de vencimento
  const tarefasPorDia = useMemo(() => {
    const passaSetor = (s: string) => setorFiltro === 'todas' || s === setorFiltro
    const m: Record<string, Tarefa[]> = {}
    tarefas.forEach((t) => {
      if (!passaSetor(t.setor_id)) return
      const dia = t.data_vencimento
      if (!dia || dia < de || dia > ate) return
      if (!m[dia]) m[dia] = []
      m[dia].push(t)
    })
    Object.values(m).forEach((arr) =>
      arr.sort((a, b) => (a.hora_limite || '99:99').localeCompare(b.hora_limite || '99:99'))
    )
    return m
  }, [tarefas, setorFiltro, de, ate])

  // BLOCO B: situação agora (só filtro de setor)
  const situacao = useMemo(() => {
    const alvo = setorFiltro === 'todas' ? setores : setores.filter((s) => s.id === setorFiltro)
    return alvo.map((s) => {
      const doSetor = tarefas.filter((t) => t.setor_id === s.id)
      return {
        setor: s.nome,
        pendentes: doSetor.filter((t) => t.status === 'pendente').length,
        atrasadas: doSetor.filter((t) => isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)).length,
        emRevisao: doSetor.filter((t) => t.status === 'pronta_revisao').length,
        refazer: doSetor.filter((t) => t.status === 'refazer_pendente').length,
      }
    })
  }, [tarefas, setores, setorFiltro])

  const historicoDetalhe = useMemo(() => {
    if (!detalhe) return []
    return historico.filter((h) => h.tarefa_id === detalhe.id)
  }, [detalhe, historico])

  if (carregando || loading) {
    return <div className="p-8 text-center text-gray-400">Carregando dashboard...</div>
  }

  const theme = getSetorTheme(setorFiltro === 'todas' ? undefined : nomeSetor(setorFiltro))
  const atalho = (d: string, a: string) => { setDe(d); setAte(a) }
  const primeiroDoMes = `${hoje.substring(0, 8)}01`

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className={`bg-gradient-to-r ${theme.headerGrad} px-4 sm:px-6 py-4 shadow-md`}>
        <div className="flex items-center gap-3">
          <Link href="/tarefas" className="text-white/90 hover:text-white"><ArrowLeft size={20} /></Link>
          <h1 className="text-xl font-bold text-white">📊 Dashboard de Tarefas</h1>
        </div>
      </div>

      {/* Filtros globais */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-1">
            <button onClick={() => atalho(hoje, hoje)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 font-medium">Hoje</button>
            <button onClick={() => atalho(addDays(hoje, -6), hoje)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 font-medium">Últimos 7 dias</button>
            <button onClick={() => atalho(primeiroDoMes, hoje)} className="text-xs bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 font-medium">Este mês</button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">De</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Até</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Setor</label>
            <select value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
              <option value="todas">Todos</option>
              {setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-8">
        {/* BLOCO A - Linha do tempo por data de vencimento */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-1">Linha do tempo</h2>
          <p className="text-xs text-gray-500 mb-4">Tarefas planejadas por data de vencimento, com o último status. Clique para ver a rastreabilidade.</p>
          <div className="space-y-3">
            {dias.map((dia) => {
              const ts = tarefasPorDia[dia] || []
              const recolhido = diasRecolhidos.has(dia)
              if (ts.length === 0) {
                return (
                  <div key={dia} className="bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-400">
                    <span className="font-medium text-gray-500 capitalize">{fmtDiaLabel(dia)}</span> — Nenhuma tarefa planejada
                  </div>
                )
              }
              return (
                <div key={dia} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      const s = new Set(diasRecolhidos)
                      recolhido ? s.delete(dia) : s.add(dia)
                      setDiasRecolhidos(s)
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <span className="font-semibold text-gray-800 capitalize flex items-center gap-2">
                      {recolhido ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      {fmtDiaLabel(dia)}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{ts.length} tarefa(s)</span>
                  </button>
                  {!recolhido && (
                    <div className="divide-y divide-gray-50">
                      {ts.map((t) => {
                        const st = STATUS_INFO[t.status]
                        const atrasada = isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)
                        return (
                          <button key={t.id} onClick={() => setDetalhe(t)} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left hover:bg-gray-50">
                            <span className="font-mono text-xs text-gray-400 w-10">{t.hora_limite ? formatHora(t.hora_limite) : '—'}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${atrasada ? 'bg-red-100 text-red-700' : st.color}`}>
                              {atrasada ? 'Atrasada' : st.label}
                            </span>
                            <span className="text-gray-800 flex-1 truncate">{t.titulo}</span>
                            <span className="text-xs text-gray-500 hidden sm:inline">{nomeSetor(t.setor_id)} · {nomeUsuario(t.responsavel_atual_id)}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* BLOCO B - Situação agora */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-1">Situação agora</h2>
          <p className="text-xs text-gray-500 mb-4">Foto do momento (fonte: tabela tarefas). Independe do período.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {situacao.map((s) => (
              <div key={s.setor} className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-800 mb-3">{s.setor}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-50 rounded-lg p-2"><span className="text-gray-500 text-xs">Pendentes</span><p className="font-bold text-gray-800">{s.pendentes}</p></div>
                  <div className={`rounded-lg p-2 ${s.atrasadas > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
                    <span className={`text-xs flex items-center gap-1 ${s.atrasadas > 0 ? 'text-red-600' : 'text-gray-500'}`}>{s.atrasadas > 0 && <AlertTriangle size={11} />} Atrasadas</span>
                    <p className={`font-bold ${s.atrasadas > 0 ? 'text-red-700' : 'text-gray-800'}`}>{s.atrasadas}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2"><span className="text-blue-600 text-xs">Em revisão</span><p className="font-bold text-blue-700">{s.emRevisao}</p></div>
                  <div className="bg-amber-50 rounded-lg p-2"><span className="text-amber-600 text-xs">Refazer</span><p className="font-bold text-amber-700">{s.refazer}</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Rodapé de auditoria */}
        <div className="text-xs text-gray-400 border-t border-gray-200 pt-4 space-y-1">
          <p><strong>Como é calculado:</strong></p>
          <p>• <strong>Linha do tempo</strong>: tarefas agrupadas pela <code>data_vencimento</code> dentro do período; o badge mostra o status atual (ou "Atrasada" se vencida e não concluída — fuso America/Sao_Paulo).</p>
          <p>• <strong>Situação agora</strong>: contagem do estado atual em <code>tarefas</code> por setor.</p>
          <p>• <strong>Rastreabilidade</strong> (ao clicar): eventos datados de <code>tarefas_historico</code> + criação (<code>criado_em</code>).</p>
        </div>
      </div>

      {/* Detalhe da tarefa (rastreabilidade) */}
      {detalhe && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setDetalhe(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header com informações */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{detalhe.titulo}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_INFO[detalhe.status].color}`}>{STATUS_INFO[detalhe.status].label}</span>
                  {detalhe.tentativa_num > 1 && <span className="text-xs text-gray-500">tentativa {detalhe.tentativa_num}</span>}
                </div>
              </div>
              <button onClick={() => setDetalhe(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>

            <div className="p-4 space-y-4">
              {detalhe.descricao && <p className="text-sm text-gray-600">{detalhe.descricao}</p>}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-gray-400">Setor</p><p className="text-gray-800">{nomeSetor(detalhe.setor_id)}</p></div>
                <div><p className="text-xs text-gray-400">Responsável</p><p className="text-gray-800">{nomeUsuario(detalhe.responsavel_atual_id)}</p></div>
                <div><p className="text-xs text-gray-400">Vencimento</p><p className="text-gray-800">{formatData(detalhe.data_vencimento)}{detalhe.hora_limite ? ` · ${formatHora(detalhe.hora_limite)}` : ''}</p></div>
                <div><p className="text-xs text-gray-400">Criada por</p><p className="text-gray-800">{nomeUsuario(detalhe.criado_por)}</p></div>
                {detalhe.concluido_em && (
                  <div><p className="text-xs text-gray-400">Concluída em</p><p className="text-gray-800">{dataSP(detalhe.concluido_em)} {horaSP(detalhe.concluido_em)}</p></div>
                )}
              </div>

              {/* Rastreabilidade */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Rastreabilidade</p>
                <div className="space-y-2">
                  {/* Criação (sintetizada) */}
                  {detalhe.criado_em && (
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-gray-400 w-24 flex-shrink-0">{dataSP(detalhe.criado_em)} {horaSP(detalhe.criado_em)}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-pink-100 text-pink-700">Criada</span>
                    </div>
                  )}
                  {historicoDetalhe.map((h) => {
                    const ev = eventoDe(h)
                    return (
                      <div key={h.id} className="flex items-start gap-3">
                        <span className="font-mono text-xs text-gray-400 w-24 flex-shrink-0">{dataSP(h.created_at)} {horaSP(h.created_at)}</span>
                        <div className="flex-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ev.cor}`}>{ev.label}</span>
                          {ev.detalhe && <p className="text-xs text-gray-600 mt-1 italic">"{ev.detalhe}"</p>}
                          <p className="text-[11px] text-gray-400 mt-0.5">por {nomeUsuario(h.registrado_por)}</p>
                        </div>
                      </div>
                    )
                  })}
                  {historicoDetalhe.length === 0 && (
                    <p className="text-xs text-gray-400">Sem eventos além da criação.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <DashboardContent />
    </ProtectedRoute>
  )
}
