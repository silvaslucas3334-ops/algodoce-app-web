'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTarefasRealtime } from '@/hooks/useTarefasRealtime'
import { supabase } from '@/lib/supabase'
import { Tarefa, TarefaEvidencia, Setor, TarefaComentario, TarefaEnvolvido } from '@/lib/types'
import ProtectedRoute from '@/components/ProtectedRoute'
import TarefaCard from '@/components/TarefaCard'
import TarefaModal from '@/components/TarefaModal'
import NovaTarefaModal from '@/components/NovaTarefaModal'
import TriagemModal from '@/components/TriagemModal'
import PagamentosOFXModal from '@/components/PagamentosOFXModal'
import { getHoje, isAtrasada, formatData, getSetorTheme } from '@/lib/tarefas-utils'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, BarChart3, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import TaskNotificationStack from '@/components/TaskNotificationStack'
import NotificacoesModal from '@/components/NotificacoesModal'
import NotificacoesPainel from '@/components/NotificacoesPainel'
import { useNotificacoesTarefas } from '@/hooks/useNotificacoesTarefas'

const DIAS_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']
const MESES_LABEL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Formata Date -> YYYY-MM-DD usando componentes locais (sem drift de UTC)
function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

function TarefasContent() {
  const router = useRouter()
  const { usuario, carregando } = useAuth()
  const { notificacoes, naoLidas, carregando: notificacoesCarregando, marcarComoLidas } = useNotificacoesTarefas(usuario?.id)
  const [tarefaPendenteAbertura, setTarefaPendenteAbertura] = useState<string | null>(null)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [evidencias, setEvidencias] = useState<TarefaEvidencia[]>([])
  const [comentarios, setComentarios] = useState<TarefaComentario[]>([])
  const [envolvidos, setEnvolvidos] = useState<TarefaEnvolvido[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [setorSelecionado, setSetorSelecionado] = useState<string | null>(null)
  const [diaSelecionado, setDiaSelecionado] = useState<string>(getHoje())
  const [tarefaSelecionada, setTarefaSelecionada] = useState<Tarefa | null>(null)
  const [criandoTarefa, setCriandoTarefa] = useState(false)
  const [triagemAberta, setTriagemAberta] = useState(false)
  const [atrasadasVidasNaSesTão, setAtrasadasVidasNaSesTão] = useState<Set<string>>(new Set())
  const [ofxAberto, setOfxAberto] = useState(false)
  const [modoVisualizar, setModoVisualizar] = useState<'semana' | 'mes'>('semana')
  const [dataBase, setDataBase] = useState<Date>(new Date())

  useEffect(() => {
    if (!carregando && !usuario) {
      router.replace('/login')
    }
  }, [carregando, usuario, router])

  useEffect(() => {
    if (!usuario) return

    async function carregar() {
      try {
        setLoading(true)

        const { data: setoresData } = await supabase
          .from('setores')
          .select('*')
          .eq('ativo', true)
          .order('nome')

        if (setoresData) {
          setSetores(setoresData)
          // Default: setor do próprio usuário (admin ou colaborador); senão primeiro ativo
          if (usuario.setor_id) {
            setSetorSelecionado(usuario.setor_id)
          } else if (setoresData.length > 0) {
            setSetorSelecionado(setoresData[0].id)
          }
        }

        let query = supabase
          .from('usuarios')
          .select('id, nome, setor_id, role')
          .eq('ativo', true)

        // Se não é admin, filtrar pela loja do usuário — mas sempre incluir
        // os admins (gestores), que não têm loja_id, para poderem ser
        // escolhidos como responsável ao criar uma tarefa
        if (usuario.role !== 'admin' && usuario.loja_id) {
          query = query.or(`loja_id.eq.${usuario.loja_id},role.eq.admin`)
        }

        const { data: usuariosData } = await query.order('nome')

        if (usuariosData) setUsuarios(usuariosData)
      } catch (err) {
        console.error('Erro ao carregar setores:', err)
      } finally {
        setLoading(false)
      }
    }

    carregar()
  }, [usuario])

  useEffect(() => {
    if (!setorSelecionado) return
    // Reset atrasadas vistas quando muda de setor
    setAtrasadasVidasNaSesTão(new Set())
    carregarTarefas()
  }, [setorSelecionado])

  async function carregarTarefas() {
    if (!setorSelecionado) return

    // No painel do setor Administrativo, o admin também vê as tarefas que
    // colaboradores de qualquer unidade criaram para ele (solicitações),
    // além das tarefas do próprio setor Administrativo.
    const setorAtual = setores.find((s) => s.id === setorSelecionado)
    const vendoComoGestor = usuario?.role === 'admin' && setorAtual?.tipo === 'administrativo'

    let query = supabase.from('tarefas').select('*')
    query = vendoComoGestor
      ? query.or(`setor_id.eq.${setorSelecionado},responsavel_atual_id.eq.${usuario!.id}`)
      : query.eq('setor_id', setorSelecionado)

    const { data: tarefasData } = await query.order('data_vencimento')

    if (tarefasData) {
      setTarefas(tarefasData)
      const ids = tarefasData.map((t) => t.id)

      const [{ data: evidenciasData }, { data: comentariosData }, { data: envolvidosData }] =
        await Promise.all([
          supabase
            .from('tarefas_evidencias')
            .select('*')
            .in('tarefa_id', ids)
            .order('data_upload', { ascending: false }),
          supabase
            .from('tarefas_comentarios')
            .select('*')
            .in('tarefa_id', ids)
            .order('created_at', { ascending: false }),
          supabase
            .from('tarefas_envolvidos')
            .select('*')
            .in('tarefa_id', ids),
        ])

      if (evidenciasData) setEvidencias(evidenciasData)
      if (comentariosData) setComentarios(comentariosData)
      if (envolvidosData) setEnvolvidos(envolvidosData)
    }
  }

  useTarefasRealtime({
    onInsert: carregarTarefas,
    onUpdate: carregarTarefas,
    onDelete: carregarTarefas,
  })

  // Clique numa notificação: a tarefa pode ser de outro setor (ex: admin
  // recebeu comentário numa tarefa do setor X enquanto olha o setor Y) —
  // troca o setor selecionado (recarrega tarefas/evidências/comentários/
  // envolvidos por esse caminho já existente) e abre assim que ela aparecer
  // no estado, em vez de duplicar a lógica de busca aqui.
  async function abrirTarefaDaNotificacao(tarefaId: string) {
    const jaCarregada = tarefas.find((t) => t.id === tarefaId)
    if (jaCarregada) {
      setTarefaSelecionada(jaCarregada)
      return
    }
    const { data } = await supabase.from('tarefas').select('setor_id').eq('id', tarefaId).single()
    if (!data) return
    setTarefaPendenteAbertura(tarefaId)
    if (data.setor_id !== setorSelecionado) setSetorSelecionado(data.setor_id)
  }

  useEffect(() => {
    if (!tarefaPendenteAbertura) return
    const encontrada = tarefas.find((t) => t.id === tarefaPendenteAbertura)
    if (encontrada) {
      setTarefaSelecionada(encontrada)
      setTarefaPendenteAbertura(null)
    }
  }, [tarefas, tarefaPendenteAbertura])

  // Monitora atrasadas em realtime — abre triagem quando há novas
  useEffect(() => {
    if (loading || !usuario || !setorSelecionado) return

    // Calcula atrasadas relevantes agora
    const atrasadasAgora = tarefas
      .filter((t) => {
        const atrasada = isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)
        if (!atrasada) return false
        if (usuario.role === 'admin') return true
        return t.responsavel_atual_id === usuario.id
      })
      .map((t) => t.id)

    // Identifica novas atrasadas (que ainda não foram vistas nesta sessão)
    const novasAtrasadas = atrasadasAgora.filter((id) => !atrasadasVidasNaSesTão.has(id))

    console.log(`[DEBUG] Atrasadas em ${setorSelecionado}: ${atrasadasAgora.length} total, ${novasAtrasadas.length} novas`, {
      atrasadas: atrasadasAgora,
      novas: novasAtrasadas,
      vidasNaSessao: Array.from(atrasadasVidasNaSesTão),
      triagemJaAberta: triagemAberta
    })

    // Se há novas atrasadas (e triagem não está aberta), abre
    // Importante: só abre se houver NOVAS atrasadas, não re-abre se já está aberto
    if (novasAtrasadas.length > 0 && !triagemAberta) {
      console.log(`[DEBUG] Abrindo TriagemModal com ${novasAtrasadas.length} novas atrasadas`)
      setTriagemAberta(true)
    }

    // Registra as atrasadas vistas agora (mesmo que triagem já estivesse aberta)
    setAtrasadasVidasNaSesTão(new Set(atrasadasAgora))
  }, [loading, tarefas, usuario, setorSelecionado])

  if (loading) {
    return <div className="p-4 text-center text-gray-400">Carregando...</div>
  }

  if (!setorSelecionado) {
    return (
      <div className="p-4 text-center text-gray-400">Nenhum setor disponível</div>
    )
  }

  const hoje = getHoje()

  // Gerar os 7 dias da semana (segunda a domingo) baseado em dataBase
  const base = new Date(dataBase)
  base.setHours(12, 0, 0, 0)
  const dow = base.getDay() // 0=dom .. 6=sab
  const offsetSegunda = dow === 0 ? 6 : dow - 1
  const diasSemana: string[] = []
  const diaSemanaInicio = new Date(base)
  diaSemanaInicio.setDate(base.getDate() - offsetSegunda)

  for (let i = 0; i < 7; i++) {
    const d = new Date(diaSemanaInicio)
    d.setDate(diaSemanaInicio.getDate() + i)
    diasSemana.push(toYMD(d))
  }

  // Gerar tarefas do mês (todas as tarefas dentro do mês de dataBase)
  const anoMes = toYMD(dataBase).substring(0, 7) // "2026-07"
  function tarefasDoMes(): Tarefa[] {
    return tarefas.filter((t) => {
      if (t.status === 'concluida' || t.status === 'cancelada') return false
      return t.data_vencimento.startsWith(anoMes)
    })
  }

  const usuariosMap = Object.fromEntries(
    usuarios.map((u) => [u.id, { nome: u.nome, role: u.role }])
  )

  // Tarefa é visível num dia? (não finalizada e vencendo naquele dia;
  // se o dia é hoje, inclui também as atrasadas)
  function tarefasDoDia(dia: string): Tarefa[] {
    return tarefas.filter((t) => {
      if (t.status === 'concluida' || t.status === 'cancelada') return false
      if (t.data_vencimento === dia) return true
      if (dia === hoje && t.data_vencimento < hoje) return true // atrasadas caem em hoje
      return false
    })
  }

  const tarefasSelecionadas = tarefasDoDia(diaSelecionado).sort((a, b) => {
    // atrasadas primeiro, depois por hora_limite
    const aAtr = isAtrasada(a.data_vencimento, a.hora_limite || null, a.status)
    const bAtr = isAtrasada(b.data_vencimento, b.hora_limite || null, b.status)
    if (aAtr !== bAtr) return aAtr ? -1 : 1
    return (a.hora_limite || '99:99').localeCompare(b.hora_limite || '99:99')
  })

  const setorAtual = setores.find((s) => s.id === setorSelecionado)
  const setorNome = setorAtual?.nome
  const theme = getSetorTheme(setorNome)
  // Admin vendo o setor Administrativo também enxerga solicitações feitas
  // por colaboradores de outras unidades (ver carregarTarefas) — essas
  // tarefas ganham um selo com a cor da unidade de origem
  const vendoComoGestor = usuario?.role === 'admin' && setorAtual?.tipo === 'administrativo'
  function origemSetorNome(tarefa: Tarefa): string | undefined {
    if (!vendoComoGestor || tarefa.setor_id === setorSelecionado) return undefined
    return setores.find((s) => s.id === tarefa.setor_id)?.nome
  }
  // Fila de revisão do setor (tarefas aguardando aprovação do gestor)
  const tarefasRevisao = tarefas.filter((t) => t.status === 'pronta_revisao')

  // Atrasadas relevantes p/ triagem: colaborador = as suas; admin = do setor
  const tarefasAtrasadas = tarefas.filter((t) => {
    const atrasada = isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)
    if (!atrasada) return false
    if (usuario?.role === 'admin') return true
    return t.responsavel_atual_id === usuario?.id
  })
  const tarefaSelecionadaEvidencias = tarefaSelecionada
    ? evidencias.filter((e) => e.tarefa_id === tarefaSelecionada.id)
    : []
  const tarefaSelecionadaComentarios = tarefaSelecionada
    ? comentarios.filter((c) => c.tarefa_id === tarefaSelecionada.id)
    : []
  const tarefaSelecionadaEnvolvidos = tarefaSelecionada
    ? envolvidos.filter((e) => e.tarefa_id === tarefaSelecionada.id)
    : []

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Notificações de tarefas */}
      <TaskNotificationStack usuarioId={usuario?.id} />

      {/* Checagem diária forçada das notificações (comentário, refazer, aprovação, conclusão pelo gestor) */}
      <NotificacoesModal
        usuarioId={usuario?.id}
        notificacoes={notificacoes}
        carregando={notificacoesCarregando}
        onFechar={() => marcarComoLidas()}
      />

      {/* Header */}
      <div className={`bg-gradient-to-r ${theme.headerGrad} px-4 sm:px-6 py-3 sm:py-2 sticky top-0 z-40 shadow-md transition-colors h-auto sm:h-20 flex items-center`}>
        <div className="flex items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-4">
            <OluquinhasLogo size="md" variant="oluquinhas" color="marrom" />
            <OluquinhasLogo size="xs" variant="rosto" color="marrom" />
            <div>
              <h1 className="text-xl font-bold" style={{color: '#401c04'}}>Tarefas</h1>
              {setorNome && (
                <p className={`text-xs ${theme.subtext} mt-0.5`}>{setorNome}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {usuario?.role === 'admin' && setores.length > 0 && (
              <select
                value={setorSelecionado}
                onChange={(e) => setSetorSelecionado(e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${theme.selectText} bg-white hover:bg-gray-50 shadow-sm border-0`}
              >
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            )}
            {usuario?.role === 'admin' &&
              setores.find((s) => s.id === setorSelecionado)?.tipo === 'administrativo' && (
                <button
                  onClick={() => setOfxAberto(true)}
                  className={`flex items-center gap-1 bg-white ${theme.selectText} rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-50`}
                  title="Lembretes de pagamento (OFX)"
                >
                  <CreditCard size={16} />
                  <span className="hidden sm:inline">Pagamentos</span>
                </button>
              )}
            {usuario?.role === 'admin' && (
              <Link
                href="/tarefas/dashboard"
                className={`flex items-center gap-1 bg-white ${theme.selectText} rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-50`}
                title="Dashboard"
              >
                <BarChart3 size={16} />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
            <NotificacoesPainel
              usuarioId={usuario?.id}
              notificacoes={notificacoes}
              naoLidas={naoLidas}
              marcarComoLidas={() => marcarComoLidas()}
              onAbrirTarefa={abrirTarefaDaNotificacao}
              botaoClassName={`bg-white ${theme.selectText} rounded-lg p-2 shadow-sm hover:bg-gray-50 flex items-center justify-center`}
            />
            <button
              onClick={() => setCriandoTarefa(true)}
              className={`flex items-center gap-1 bg-white ${theme.selectText} rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-50`}
            >
              <Plus size={16} /> Nova Tarefa
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 py-4 sm:py-6 w-full">
        {/* Fila de revisão (admin) */}
        {usuario?.role === 'admin' && tarefasRevisao.length > 0 && (
          <div className="mb-6 sm:mb-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h2 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
              🔎 Fila de revisão
              <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {tarefasRevisao.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {tarefasRevisao.map((tarefa) => (
                <TarefaCard
                  key={tarefa.id}
                  tarefa={tarefa}
                  responsavelNome={
                    usuariosMap[tarefa.responsavel_atual_id]?.nome || 'Desconhecido'
                  }
                  origemSetorNome={origemSetorNome(tarefa)}
                  onClick={() => setTarefaSelecionada(tarefa)}
                  tamanho="grande"
                />
              ))}
            </div>
          </div>
        )}

        {/* Controles de Visualização */}
        <div className="flex items-center justify-between mb-6 sm:mb-6">
          <div className="flex items-center gap-3">
            {/* Setas de navegação */}
            <button
              onClick={() => {
                const novadata = new Date(dataBase)
                if (modoVisualizar === 'semana') {
                  novadata.setDate(novadata.getDate() - 7)
                } else {
                  novadata.setMonth(novadata.getMonth() - 1)
                }
                setDataBase(novadata)
                setDiaSelecionado(toYMD(novadata))
              }}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={modoVisualizar === 'semana' ? 'Semana anterior' : 'Mês anterior'}
            >
              <ChevronLeft size={20} className="text-gray-600" />
            </button>

            {/* Label da semana/mês */}
            <div className="min-w-[200px] text-center">
              {modoVisualizar === 'semana' ? (
                <p className="text-sm font-semibold text-gray-800">
                  {formatData(diasSemana[0])} até {formatData(diasSemana[6])}
                </p>
              ) : (
                <p className="text-sm font-semibold text-gray-800">
                  {MESES_LABEL[dataBase.getMonth()]} de {dataBase.getFullYear()}
                </p>
              )}
            </div>

            <button
              onClick={() => {
                const novadata = new Date(dataBase)
                if (modoVisualizar === 'semana') {
                  novadata.setDate(novadata.getDate() + 7)
                } else {
                  novadata.setMonth(novadata.getMonth() + 1)
                }
                setDataBase(novadata)
                setDiaSelecionado(toYMD(novadata))
              }}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              title={modoVisualizar === 'semana' ? 'Próxima semana' : 'Próximo mês'}
            >
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Bullets de modo de visualização */}
          <div className="flex gap-2">
            <button
              onClick={() => setModoVisualizar('semana')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                modoVisualizar === 'semana'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setModoVisualizar('mes')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                modoVisualizar === 'mes'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Mês
            </button>
          </div>
        </div>

        {/* Semana - largura total */}
        {modoVisualizar === 'semana' && (
          <>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 sm:mb-3">
              Semana
            </h2>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-3 mb-8 sm:mb-8">
          {diasSemana.map((dia, idx) => {
            const count = tarefasDoDia(dia).length
            const ehHoje = dia === hoje
            const selecionado = dia === diaSelecionado
            const diaNum = new Date(dia + 'T12:00:00').getDate()

            return (
              <button
                key={dia}
                onClick={() => setDiaSelecionado(dia)}
                className={`flex flex-col items-center rounded-xl border-2 py-2 sm:py-3 px-1 transition-all ${
                  selecionado
                    ? `border-transparent bg-gradient-to-br ${theme.headerGrad} text-white shadow-lg scale-[1.03]`
                    : ehHoje
                    ? 'border-blue-400 bg-blue-50 hover:border-blue-500 hover:shadow-sm'
                    : count > 0
                    ? `${theme.dayBorderTasks} bg-white hover:shadow-sm`
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <span
                  className={`text-xs font-semibold ${
                    selecionado ? 'text-white/80' : 'text-gray-500'
                  }`}
                >
                  {DIAS_LABEL[idx]}
                </span>
                <span
                  className={`text-xl sm:text-2xl font-bold ${
                    selecionado ? 'text-white' : ehHoje ? 'text-blue-700' : 'text-gray-800'
                  }`}
                >
                  {diaNum}
                </span>
                {count > 0 ? (
                  <span
                    className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                      selecionado
                        ? `bg-white ${theme.daySelText}`
                        : `${theme.badge} text-white`
                    }`}
                  >
                    {count}
                  </span>
                ) : (
                  <span
                    className={`mt-1 text-xs ${
                      selecionado ? 'text-white/50' : 'text-gray-300'
                    }`}
                  >
                    –
                  </span>
                )}
                {ehHoje && !selecionado && (
                  <span className="mt-1 text-[10px] font-bold text-blue-600 uppercase">
                    hoje
                  </span>
                )}
                {ehHoje && selecionado && (
                  <span className="mt-1 text-[10px] font-bold text-white/80 uppercase">
                    hoje
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tarefas do dia selecionado */}
        <div className="flex items-baseline justify-between mb-6 sm:mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {diaSelecionado === hoje
              ? 'Hoje'
              : formatData(diaSelecionado)}
          </h2>
          <span className="text-sm text-gray-500">
            {tarefasSelecionadas.length}{' '}
            {tarefasSelecionadas.length === 1 ? 'tarefa' : 'tarefas'}
          </span>
        </div>

        {tarefasSelecionadas.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">Nenhuma tarefa neste dia 🎉</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-3">
            {tarefasSelecionadas.map((tarefa) => {
              const criador = usuariosMap[tarefa.criado_por]
              const criadoPorNome =
                criador && criador.role !== 'admin' ? criador.nome : undefined
              return (
                <TarefaCard
                  key={tarefa.id}
                  tarefa={tarefa}
                  responsavelNome={
                    usuariosMap[tarefa.responsavel_atual_id]?.nome || 'Desconhecido'
                  }
                  criadoPorNome={criadoPorNome}
                  origemSetorNome={origemSetorNome(tarefa)}
                  onClick={() => setTarefaSelecionada(tarefa)}
                  tamanho="grande"
                />
              )
            })}
          </div>
        )}
          </>
        )}

        {/* Mês - visualização calendário */}
        {modoVisualizar === 'mes' && (
          <>
            <div className="mb-6">
              <div className={`${theme.headerGrad} rounded-xl p-4 shadow-sm`}>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((dia) => (
                    <div key={dia} className="text-center text-xs font-bold text-gray-700 py-2 uppercase tracking-wider">
                      {dia}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {(() => {
                    const primeiroDia = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1)
                    const dow = primeiroDia.getDay() === 0 ? 6 : primeiroDia.getDay() - 1
                    const ultimoDia = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0).getDate()
                    const diasMes = ultimoDia - 1 + dow

                    return Array.from({ length: diasMes }).map((_, idx) => {
                      const diaDoMes = idx - dow + 1
                      const estaMes = diaDoMes > 0 && diaDoMes <= ultimoDia

                      if (!estaMes) {
                        return <div key={idx} />
                      }

                      const data = new Date(dataBase.getFullYear(), dataBase.getMonth(), diaDoMes)
                      const dataStr = toYMD(data)
                      const tarefasNoDia = tarefas.filter(
                        (t) =>
                          t.data_vencimento === dataStr &&
                          t.status !== 'concluida' &&
                          t.status !== 'cancelada'
                      )
                      const atrasadasNoDia = tarefasNoDia.filter((t) =>
                        isAtrasada(t.data_vencimento, t.hora_limite || null, t.status)
                      )
                      const ehHoje = dataStr === hoje
                      const selecionado = diaSelecionado === dataStr

                      return (
                        <button
                          key={idx}
                          onClick={() => setDiaSelecionado(dataStr)}
                          className={`p-1.5 rounded-lg border shadow-sm transition-all text-center aspect-square flex flex-col items-center justify-center font-medium relative group ${
                            selecionado
                              ? 'bg-gray-200 border-gray-400 shadow-md scale-105'
                              : ehHoje
                              ? 'bg-gray-300 border-2 border-gray-600 shadow-md'
                              : atrasadasNoDia.length > 0
                              ? 'bg-red-100 border border-red-400 text-red-900 hover:shadow-lg hover:scale-105'
                              : tarefasNoDia.length > 0
                              ? 'bg-white border border-gray-400 hover:shadow-md hover:scale-105'
                              : 'bg-white border border-gray-300 text-gray-800 hover:shadow-md hover:scale-105'
                          }`}
                          title={formatData(dataStr)}
                        >
                          <span className="text-xs font-bold">{diaDoMes}</span>
                          {tarefasNoDia.length > 0 && (
                            <span className={`text-xs font-bold mt-1 inline-flex items-center justify-center min-w-4 h-4 rounded-full text-white ${
                              atrasadasNoDia.length > 0 ? 'bg-red-500' : 'bg-gray-600'
                            }`}>
                              {tarefasNoDia.length}
                            </span>
                          )}
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>

            {/* Tarefas do dia selecionado no mês */}
            <div className="flex items-baseline justify-between mb-6 sm:mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                {diaSelecionado === hoje ? 'Hoje' : formatData(diaSelecionado)}
              </h2>
              <span className="text-sm text-gray-500">
                {tarefasSelecionadas.length}{' '}
                {tarefasSelecionadas.length === 1 ? 'tarefa' : 'tarefas'}
              </span>
            </div>

            {tarefasSelecionadas.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <p className="text-gray-500">Nenhuma tarefa neste dia 🎉</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-3">
                {tarefasSelecionadas.map((tarefa) => {
                  const criador = usuariosMap[tarefa.criado_por]
                  const criadoPorNome =
                    criador && criador.role !== 'admin' ? criador.nome : undefined
                  return (
                    <TarefaCard
                      key={tarefa.id}
                      tarefa={tarefa}
                      responsavelNome={
                        usuariosMap[tarefa.responsavel_atual_id]?.nome || 'Desconhecido'
                      }
                      criadoPorNome={criadoPorNome}
                      origemSetorNome={origemSetorNome(tarefa)}
                      onClick={() => setTarefaSelecionada(tarefa)}
                      tamanho="grande"
                    />
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {tarefaSelecionada && (
        <TarefaModal
          key={tarefaSelecionada.id}
          tarefa={tarefaSelecionada}
          responsavelNome={
            usuariosMap[tarefaSelecionada.responsavel_atual_id]?.nome ||
            'Desconhecido'
          }
          evidencias={tarefaSelecionadaEvidencias}
          comentarios={tarefaSelecionadaComentarios}
          envolvidos={tarefaSelecionadaEnvolvidos}
          usuariosMap={usuariosMap}
          usuariosDoSetor={usuarios
            .filter((u) => u.setor_id === tarefaSelecionada.setor_id)
            .map((u) => ({ id: u.id, nome: u.nome }))}
          setorTipo={
            (setores.find((s) => s.id === tarefaSelecionada.setor_id)?.tipo as
              | 'operacional'
              | 'administrativo') || 'operacional'
          }
          usuarioAtualId={usuario?.id || ''}
          usuarioAtualRole={usuario?.role || ''}
          aberta={!!tarefaSelecionada}
          onClose={() => setTarefaSelecionada(null)}
          onStatusChange={() => {
            setTarefaSelecionada(null)
            carregarTarefas()
          }}
          onComentario={carregarTarefas}
        />
      )}

      {criandoTarefa && usuario && (() => {
        const setorObj = setores.find((s) => s.id === setorSelecionado)
        if (!setorObj) return null
        const usuariosDoSetor = usuarios
          .filter((u) => u.setor_id === setorSelecionado)
          .map((u) => ({ id: u.id, nome: u.nome }))
        const gestores = usuarios
          .filter((u) => u.role === 'admin')
          .map((u) => ({ id: u.id, nome: u.nome }))
        return (
          <NovaTarefaModal
            setor={setorObj}
            usuariosDoSetor={usuariosDoSetor}
            gestores={gestores}
            criadoPor={usuario.id}
            criadoPorNome={usuario.nome}
            permitirRecorrencia={true}
            onClose={() => setCriandoTarefa(false)}
            onCreated={carregarTarefas}
          />
        )
      })()}

      {ofxAberto && usuario && (() => {
        const setorObj = setores.find((s) => s.id === setorSelecionado)
        if (!setorObj) return null
        const usuariosDoSetor = usuarios
          .filter((u) => u.setor_id === setorSelecionado)
          .map((u) => ({ id: u.id, nome: u.nome }))
        return (
          <PagamentosOFXModal
            setorId={setorObj.id}
            usuariosDoSetor={usuariosDoSetor.length ? usuariosDoSetor : [{ id: usuario.id, nome: usuario.nome }]}
            criadoPor={usuario.id}
            onClose={() => setOfxAberto(false)}
            onCreated={carregarTarefas}
          />
        )
      })()}

      {triagemAberta && usuario && setorSelecionado && (
        <TriagemModal
          usuarioAtualId={usuario.id}
          usuarioRole={usuario.role || 'colaborador'}
          setorId={setorSelecionado}
          usuarios={usuarios.map((u) => ({
            id: u.id,
            nome: u.nome,
          }))}
          onClose={() => setTriagemAberta(false)}
          onAbrirTarefa={(t) => {
            setTriagemAberta(false)
            setTarefaSelecionada(t)
          }}
          onDone={carregarTarefas}
        />
      )}
    </div>
  )
}

export default function TarefasPage() {
  return (
    <ProtectedRoute allowedRoles={['admin', 'cozinha', 'loja']}>
      <TarefasContent />
    </ProtectedRoute>
  )
}
