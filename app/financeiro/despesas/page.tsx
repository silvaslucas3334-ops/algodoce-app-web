'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import FornecedorCombobox, { OpcaoFornecedor } from '@/components/FornecedorCombobox'
import Link from 'next/link'
import { Plus, Search, ReceiptText, ShoppingCart, CheckCircle, X, Loader } from 'lucide-react'
import { EtiquetaAprovacao, FinanceiroLancamento } from '@/lib/types'
import { UNIDADE_LABEL, STATUS_CONCILIACAO_LABEL, STATUS_CONCILIACAO_COLOR, ETIQUETA_APROVACAO_LABEL, ETIQUETA_APROVACAO_COLOR } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { hojeISO, statusExibicao } from '@/lib/financeiro-utils'
import EtiquetaAprovacaoSeletor from '@/components/EtiquetaAprovacaoSeletor'
import DespesasAcoesLote from '@/components/DespesasAcoesLote'
import { descreverResultadoLote, ResultadoLote } from '@/lib/financeiro-despesas-lote'
import {
  Agrupamento,
  buscarPagina,
  buscarResumo,
  buscarTodos,
  filtrosParaQuery,
  FiltroEtiqueta,
  FiltrosDespesas,
  lerFiltros,
  resumir,
  ResumoDespesas,
  STATUS_CARGA_COMPLETA,
  statusPadrao,
  StatusLista,
  TAMANHO_PAGINA,
} from '@/lib/financeiro-despesas-lista'

const FILTROS: { key: StatusLista; label: string }[] = [
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'vence7', label: 'Vence em 7 dias' },
  { key: 'aberto', label: 'Em aberto' },
  { key: 'pagas', label: 'Pagas' },
  { key: 'todas', label: 'Todas' },
  { key: 'canceladas', label: 'Canceladas' },
]

const FILTROS_ETIQUETA: { key: FiltroEtiqueta; label: string }[] = [
  { key: 'todas', label: 'Todas' },
  { key: 'sem_etiqueta', label: 'Sem etiqueta' },
  { key: 'planejar_pagamento', label: ETIQUETA_APROVACAO_LABEL.planejar_pagamento },
  { key: 'aprovada_pagamento', label: ETIQUETA_APROVACAO_LABEL.aprovada_pagamento },
]

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Posição da lista guardada ao abrir uma despesa, pra devolver o usuário ao
// mesmo ponto (e destacar a linha que ele estava olhando) quando voltar.
const CHAVE_POSICAO = 'despesas:posicao'

interface GrupoLancamentos {
  chave: string
  label: string
  corBadge?: string
  itens: FinanceiroLancamento[]
  subtotal: number
}

/** Agrupa "Em aberto" por mês de vencimento — dá o panorama do mês sem a lista virar uma maratona conforme recorrências pré-geradas se acumulam meses à frente. */
function agruparPorMes(itens: FinanceiroLancamento[]): GrupoLancamentos[] {
  const grupos = new Map<string, FinanceiroLancamento[]>()
  itens.forEach((l) => {
    const chave = l.data_vencimento.slice(0, 7) // YYYY-MM
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push(l)
  })
  return Array.from(grupos.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, lista]) => {
      const [ano, mes] = chave.split('-').map(Number)
      return { chave, label: `${MESES[mes - 1]} de ${ano}`, itens: lista, subtotal: lista.reduce((s, l) => s + l.valor_total, 0) }
    })
}

/** Agrupa "Em aberto" por etiqueta — responde "o que já está pronto pra eu pagar agora" de relance, sem precisar abrir cada card. */
function agruparPorEtiqueta(itens: FinanceiroLancamento[]): GrupoLancamentos[] {
  const ordem: (EtiquetaAprovacao | 'sem_etiqueta')[] = ['aprovada_pagamento', 'planejar_pagamento', 'sem_etiqueta']
  return ordem
    .map((chave) => {
      const lista = itens.filter((l) => (l.etiqueta_aprovacao || 'sem_etiqueta') === chave)
      return {
        chave,
        label: chave === 'sem_etiqueta' ? 'Sem etiqueta' : ETIQUETA_APROVACAO_LABEL[chave],
        corBadge: chave === 'sem_etiqueta' ? undefined : ETIQUETA_APROVACAO_COLOR[chave],
        itens: lista,
        subtotal: lista.reduce((s, l) => s + l.valor_total, 0),
      }
    })
    .filter((g) => g.itens.length > 0)
}

function formatarDataCurta(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

function DespesasContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // O estado da lista mora na URL (?status=&q=&parte=&etq=&de=&ate=&agr=): abrir
  // uma despesa e voltar, atualizar a página ou mandar o link devolve exatamente
  // a mesma visão. URL sem parâmetros = a tela de sempre (Em aberto, sem filtros).
  const queryAtual = searchParams.toString()
  const urlAtual = queryAtual ? `${pathname}?${queryAtual}` : pathname
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtros = useMemo(() => lerFiltros(searchParams), [queryAtual])

  const atualizarFiltros = useCallback(
    (parcial: Partial<FiltrosDespesas>) => {
      const qs = filtrosParaQuery({ ...filtros, ...parcial })
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [filtros, pathname, router]
  )

  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState<ResumoDespesas | null>(null)
  const [loading, setLoading] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState('')
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [mostrarMaisFiltros, setMostrarMaisFiltros] = useState(false)
  const [buscaDigitada, setBuscaDigitada] = useState(filtros.q)
  const [partes, setPartes] = useState<OpcaoFornecedor[]>([])
  const [destacadoId, setDestacadoId] = useState<string | null>(null)

  // Ações em lote (só admin): modo "Selecionar" mostra caixinhas nas despesas em aberto.
  const ehAdmin = usuario?.role === 'admin'
  const [modoSelecao, setModoSelecao] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<{ texto: string; ok: boolean } | null>(null)

  const paginado = !STATUS_CARGA_COMPLETA.includes(filtros.status)
  const chaveConsulta = [filtros.status, filtros.q, filtros.parteId, filtros.etiqueta, filtros.de, filtros.ate].join('|')

  // --- consulta ---------------------------------------------------------
  const requisicaoRef = useRef(0)
  const carregar = useCallback(
    async (opcoes?: { silencioso?: boolean; quantidade?: number }) => {
      const numero = ++requisicaoRef.current
      if (!opcoes?.silencioso) setLoading(true)
      setErro('')
      try {
        if (!paginado) {
          const linhas = await buscarTodos(filtros)
          if (numero !== requisicaoRef.current) return
          setLancamentos(linhas)
          setTotal(linhas.length)
          setResumo(resumir(linhas))
        } else {
          const quantidade = Math.max(opcoes?.quantidade ?? 0, TAMANHO_PAGINA)
          const [pagina, resumoGeral] = await Promise.all([buscarPagina(filtros, 0, quantidade), buscarResumo(filtros)])
          if (numero !== requisicaoRef.current) return
          setLancamentos(pagina.linhas)
          setTotal(pagina.total)
          setResumo(resumoGeral)
        }
      } catch (e: any) {
        console.error('Erro ao carregar despesas:', e)
        if (numero === requisicaoRef.current) setErro('Erro ao carregar: ' + (e?.message || 'desconhecido'))
      } finally {
        if (numero === requisicaoRef.current) setLoading(false)
      }
    },
    [filtros, paginado]
  )
  const carregarRef = useRef(carregar)
  carregarRef.current = carregar

  // Ao montar: se o usuário está voltando de uma despesa aberta a partir desta
  // mesma URL, guarda onde estava (declarado antes do efeito de carga de propósito).
  const restaurarRef = useRef<{ y: number; id: string; qtd: number } | null>(null)
  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem(CHAVE_POSICAO)
      if (bruto) {
        const posicao = JSON.parse(bruto)
        if (posicao?.url === urlAtual) restaurarRef.current = posicao
        sessionStorage.removeItem(CHAVE_POSICAO)
      }
    } catch {
      /* sessionStorage indisponível: segue sem restaurar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!usuario) return
    // Voltando pra uma lista paginada: recarrega de uma vez tudo o que já estava aberta.
    carregarRef.current({ quantidade: restaurarRef.current?.qtd })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, chaveConsulta])

  // Depois da primeira carga, devolve a rolagem e destaca a linha visitada.
  useEffect(() => {
    const posicao = restaurarRef.current
    if (loading || !posicao) return
    restaurarRef.current = null
    // setTimeout (e não requestAnimationFrame): dá tempo do React pintar a lista e
    // também roda quando a aba não está sendo pintada.
    // Sem cleanup de propósito: a posição já foi consumida acima, então cancelar este
    // temporizador numa re-renderização perderia a restauração.
    setTimeout(() => {
      window.scrollTo({ top: posicao.y })
      setDestacadoId(posicao.id)
      setTimeout(() => setDestacadoId(null), 2500)
    }, 50)
  }, [loading, lancamentos])

  // Mudou o filtro: a seleção anterior não vale mais. Recarregou a lista: só ficam selecionadas
  // as que ainda estão na tela e em aberto (paga/cancelada em outra sessão sai da seleção).
  useEffect(() => {
    setSelecionados(new Set())
  }, [chaveConsulta])
  useEffect(() => {
    setSelecionados((prev) => {
      if (prev.size === 0) return prev
      const validos = new Set(lancamentos.filter((l) => l.status === 'aberto').map((l) => l.id))
      const filtrado = new Set([...prev].filter((id) => validos.has(id)))
      return filtrado.size === prev.size ? prev : filtrado
    })
  }, [lancamentos])

  // Fornecedores pra o filtro (todos os cadastrados, não só os da página atual).
  useEffect(() => {
    if (!usuario) return
    supabase
      .from('financeiro_partes')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setPartes((data || []) as OpcaoFornecedor[]))
  }, [usuario])

  // Se o perfil não enxerga a tabela de fornecedores (ex.: regra de loja), usa os que aparecem na lista.
  const opcoesFornecedor = useMemo(() => {
    if (partes.length > 0) return partes
    const mapa = new Map<string, string>()
    lancamentos.forEach((l) => { if (l.parte_id && l.parte?.nome) mapa.set(l.parte_id, l.parte.nome) })
    return Array.from(mapa.entries()).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [partes, lancamentos])
  const nomeFornecedor = opcoesFornecedor.find((o) => o.id === filtros.parteId)?.nome

  // --- busca por texto: debounce de 350 ms antes de mexer na URL ----------
  useEffect(() => {
    setBuscaDigitada(filtros.q)
  }, [filtros.q])
  useEffect(() => {
    if (buscaDigitada === filtros.q) return
    const t = setTimeout(() => atualizarFiltros({ q: buscaDigitada }), 350)
    return () => clearTimeout(t)
  }, [buscaDigitada, filtros.q, atualizarFiltros])

  function escolherFornecedor(id: string) {
    // Quem estava na visão padrão passa pra visão padrão do novo estado (fornecedor → histórico completo);
    // quem já tinha escolhido uma aba (ex.: Pagas) mantém.
    const estavaNoPadrao = filtros.status === statusPadrao(filtros.parteId)
    atualizarFiltros({ parteId: id, status: estavaNoPadrao ? statusPadrao(id) : filtros.status })
  }

  const filtrosAtivos: { chave: string; texto: string; remover: () => void }[] = []
  if (filtros.q) filtrosAtivos.push({ chave: 'q', texto: `Busca: "${filtros.q}"`, remover: () => atualizarFiltros({ q: '' }) })
  if (filtros.etiqueta !== 'todas') {
    const rotulo = FILTROS_ETIQUETA.find((f) => f.key === filtros.etiqueta)?.label
    filtrosAtivos.push({ chave: 'etq', texto: `Etiqueta: ${rotulo}`, remover: () => atualizarFiltros({ etiqueta: 'todas' }) })
  }
  if (filtros.de || filtros.ate) {
    const texto =
      filtros.de && filtros.ate
        ? `Vencimento ${formatarDataCurta(filtros.de)} a ${formatarDataCurta(filtros.ate)}`
        : filtros.de
          ? `Vencimento desde ${formatarDataCurta(filtros.de)}`
          : `Vencimento até ${formatarDataCurta(filtros.ate)}`
    filtrosAtivos.push({ chave: 'venc', texto, remover: () => atualizarFiltros({ de: '', ate: '' }) })
  }
  const temFiltroAlemDoStatus = filtrosAtivos.length > 0 || !!filtros.parteId
  function limparTudo() {
    atualizarFiltros({ q: '', parteId: '', etiqueta: 'todas', de: '', ate: '', status: statusPadrao('') })
  }

  // --- ações --------------------------------------------------------------
  async function marcarPago(l: FinanceiroLancamento) {
    setPagandoId(l.id)
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: hojeISO(), updated_at: new Date().toISOString() })
        .eq('id', l.id)
      if (error) throw error
      await carregar({ silencioso: true, quantidade: lancamentos.length })
    } catch (err: any) {
      console.error('Erro ao marcar pago:', err)
      alert('Erro ao marcar como paga: ' + (err?.message || 'desconhecido'))
    } finally {
      setPagandoId(null)
    }
  }

  async function mudarEtiqueta(l: FinanceiroLancamento, nova: EtiquetaAprovacao | null) {
    setLancamentos((prev) => prev.map((x) => (x.id === l.id ? { ...x, etiqueta_aprovacao: nova } : x)))
    const { error } = await supabase
      .from('financeiro_lancamentos')
      .update({ etiqueta_aprovacao: nova, updated_at: new Date().toISOString() })
      .eq('id', l.id)
    if (error) {
      console.error('Erro ao salvar etiqueta:', error)
      setLancamentos((prev) => prev.map((x) => (x.id === l.id ? { ...x, etiqueta_aprovacao: l.etiqueta_aprovacao } : x)))
      alert('Erro ao salvar etiqueta: ' + error.message)
    }
  }

  async function carregarMais() {
    setCarregandoMais(true)
    try {
      const pagina = await buscarPagina(filtros, lancamentos.length, TAMANHO_PAGINA)
      setLancamentos((prev) => {
        const ja = new Set(prev.map((x) => x.id))
        return [...prev, ...pagina.linhas.filter((x) => !ja.has(x.id))]
      })
      setTotal(pagina.total)
    } catch (e: any) {
      setErro('Erro ao carregar mais: ' + (e?.message || 'desconhecido'))
    } finally {
      setCarregandoMais(false)
    }
  }

  function guardarPosicao(id: string) {
    try {
      sessionStorage.setItem(CHAVE_POSICAO, JSON.stringify({ url: urlAtual, y: window.scrollY, id, qtd: lancamentos.length }))
    } catch {
      /* sem sessionStorage: volta pro topo, como antes */
    }
  }

  // --- ações em lote ------------------------------------------------------
  const abertasNaTela = lancamentos.filter((l) => l.status === 'aberto')
  const podeSelecionar = ehAdmin && abertasNaTela.length > 0
  const selecionadasObjs = abertasNaTela.filter((l) => selecionados.has(l.id))

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }
  function alternarTodas() {
    setSelecionados((prev) => (prev.size === abertasNaTela.length ? new Set() : new Set(abertasNaTela.map((l) => l.id))))
  }
  function alternarGrupo(itens: FinanceiroLancamento[]) {
    const ids = itens.filter((l) => l.status === 'aberto').map((l) => l.id)
    setSelecionados((prev) => {
      const novo = new Set(prev)
      const todos = ids.length > 0 && ids.every((id) => novo.has(id))
      ids.forEach((id) => (todos ? novo.delete(id) : novo.add(id)))
      return novo
    })
  }
  function sairDaSelecao() {
    setModoSelecao(false)
    setSelecionados(new Set())
  }
  async function concluirLote(resultado: ResultadoLote) {
    setAviso(descreverResultadoLote(resultado))
    setSelecionados(new Set())
    await carregar({ silencioso: true, quantidade: lancamentos.length })
  }

  // --- derivados ----------------------------------------------------------
  const grupos = filtros.status === 'aberto' ? (filtros.agrupar === 'mes' ? agruparPorMes(lancamentos) : agruparPorEtiqueta(lancamentos)) : null

  const totalDoFiltro = resumo
    ? filtros.status === 'pagas'
      ? resumo.pago.total
      : filtros.status === 'canceladas'
        ? resumo.cancelado.total
        : filtros.status === 'todas'
          ? resumo.aberto.total + resumo.pago.total
          : resumo.aberto.total
    : 0

  function renderCard(l: FinanceiroLancamento) {
    const st = statusExibicao(l.status, l.data_vencimento, l.valor_pago_conciliado)
    const href = `/financeiro/despesas/${l.id}?voltarPara=${encodeURIComponent(urlAtual)}`
    const selecionavel = modoSelecao && ehAdmin && l.status === 'aberto'
    const marcado = selecionados.has(l.id)
    return (
      <div
        key={l.id}
        className={`rounded-xl p-4 shadow-sm border hover:shadow-md transition-all ${
          destacadoId === l.id
            ? 'bg-white border-pink-400 ring-2 ring-pink-300'
            : selecionavel && marcado
              ? 'bg-pink-50/60 border-pink-400 ring-1 ring-pink-300'
              : 'bg-white border-gray-100'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {selecionavel && (
            <input
              type="checkbox"
              checked={marcado}
              onChange={() => alternarSelecao(l.id)}
              aria-label={`Selecionar ${l.descricao}`}
              className="mt-1 h-5 w-5 flex-shrink-0 accent-pink-700"
            />
          )}
          <Link
            href={href}
            onClick={(e) => {
              if (selecionavel) {
                e.preventDefault() // no modo seleção, tocar no card marca/desmarca em vez de abrir
                alternarSelecao(l.id)
              } else guardarPosicao(l.id)
            }}
            className="flex-1 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              {l.tipo === 'compra_insumos' ? (
                <ShoppingCart size={14} className="text-blue-600 flex-shrink-0" />
              ) : (
                <ReceiptText size={14} className="text-purple-600 flex-shrink-0" />
              )}
              <p className="font-semibold text-gray-800">{l.descricao}</p>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {l.parte?.nome} · {UNIDADE_LABEL[l.unidade]}
              {l.conta && <span> · {l.conta.codigo} {l.conta.nome}</span>}
            </p>
            {l.tipo === 'compra_insumos' && !!l.itens?.length && (() => {
              const nomes = l.itens.map((i: any) => i.materia_prima?.nome).filter(Boolean) as string[]
              return (
                <p className="text-xs text-gray-500 mt-0.5">
                  {l.itens.length} {l.itens.length === 1 ? 'item' : 'itens'}
                  {nomes.length > 0 && <span> · {nomes.slice(0, 3).join(', ')}{l.itens.length > 3 ? `, +${l.itens.length - 3}` : ''}</span>}
                </p>
              )
            })()}
            <p className="text-xs text-gray-400 mt-1">
              {l.status === 'pago' && l.data_pagamento
                ? `Paga em ${formatarDataCurta(l.data_pagamento)}`
                : `Vencimento: ${formatarDataCurta(l.data_vencimento)}`}
              {l.tipo === 'despesa' && !l.conta_id && <span className="ml-2 text-amber-600">· sem conta</span>}
            </p>
          </Link>
          <div className="text-right flex flex-col items-end gap-1.5">
            {!!l.valor_juros_multa && l.valor_juros_multa > 0 && (
              <p className="text-[11px] text-red-600 font-medium">
                + {formatBRL(l.valor_juros_multa)} juros/multa
              </p>
            )}
            {!!l.valor_pago_conciliado && l.valor_pago_conciliado > 0 && l.status === 'aberto' && (
              <p className="text-[11px] text-blue-600 font-medium">
                pago {formatBRL(l.valor_pago_conciliado)} · faltam {formatBRL(l.valor_total - l.valor_pago_conciliado)}
              </p>
            )}
            <p className="font-semibold text-gray-800">{formatBRL(l.valor_total)}</p>
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${st.cor}`}>{st.label}</span>
            {!l.afeta_fluxo_caixa && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium bg-slate-100 text-slate-600"
                title="Não gera evento no fluxo de caixa nem em contas a pagar"
              >
                Não-caixa
              </span>
            )}
            {ehAdmin && l.status === 'aberto' && !modoSelecao && (
              <EtiquetaAprovacaoSeletor valor={l.etiqueta_aprovacao} onChange={(nova) => mudarEtiqueta(l, nova)} />
            )}
            {l.extrato_transacao ? (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${STATUS_CONCILIACAO_COLOR[l.extrato_transacao.status_conciliacao]}`}
              >
                {STATUS_CONCILIACAO_LABEL[l.extrato_transacao.status_conciliacao]}
              </span>
            ) : (
              // Paga via conciliação parcial (várias transações do extrato somadas até
              // bater o valor_total) — não tem um extrato_transacao_id único pra apontar
              // (ver confirmarConciliacaoParcial em lib/financeiro-reconciliacao.ts), mas
              // o rastro de que veio do banco precisa continuar visível, no mesmo estilo.
              !!l.valor_pago_conciliado && l.valor_pago_conciliado > 0 && l.status !== 'aberto' && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium ${STATUS_CONCILIACAO_COLOR.conciliado}`}>
                  {STATUS_CONCILIACAO_LABEL.conciliado}
                </span>
              )
            )}
            {l.status === 'aberto' && !modoSelecao && (
              <button
                onClick={() => marcarPago(l)}
                disabled={pagandoId === l.id}
                className="text-xs px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircle size={12} /> {pagandoId === l.id ? 'Salvando...' : 'Pagar'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className={`min-h-screen bg-gray-50 ${selecionadasObjs.length > 0 ? 'pb-44' : 'pb-20'}`}>
        <PageHeader
          title="Despesas"
          backHref="/financeiro"
          maxWidth="max-w-4xl"
          actions={
            <>
              <Link
                href="/financeiro/compras/nova"
                className="border border-pink-700 text-pink-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-50"
              >
                <ShoppingCart size={16} /> Lançar Nota
              </Link>
              <Link
                href="/financeiro/despesas/nova"
                className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
              >
                <Plus size={16} /> Nova Despesa
              </Link>
            </>
          }
        />

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por descrição, beneficiário ou conta..."
              value={buscaDigitada}
              onChange={(e) => setBuscaDigitada(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => atualizarFiltros({ status: f.key })}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${
                  filtros.status === f.key
                    ? 'bg-pink-100 text-pink-700 border-transparent font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              onClick={() => setMostrarMaisFiltros((v) => !v)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border flex items-center gap-1 ${
                mostrarMaisFiltros || filtros.de || filtros.ate
                  ? 'bg-gray-800 text-white border-transparent font-semibold'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              Vencimento{filtros.de || filtros.ate ? ' ·' : ''}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            <FornecedorCombobox valorId={filtros.parteId} opcoes={opcoesFornecedor} onChange={escolherFornecedor} />
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-gray-400 flex-shrink-0">Etiqueta:</span>
              {FILTROS_ETIQUETA.map((f) => (
                <button
                  key={f.key}
                  onClick={() => atualizarFiltros({ etiqueta: f.key })}
                  className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap border ${
                    filtros.etiqueta === f.key
                      ? 'bg-gray-800 text-white border-transparent font-semibold'
                      : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filtros.status === 'aberto' && (
              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                <span className="text-xs text-gray-400 mr-1">Agrupar:</span>
                {(['mes', 'etiqueta'] as Agrupamento[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => atualizarFiltros({ agrupar: a })}
                    className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap border ${
                      filtros.agrupar === a
                        ? 'bg-pink-100 text-pink-700 border-transparent font-semibold'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    {a === 'mes' ? 'Mês' : 'Etiqueta'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mostrarMaisFiltros && (
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Vencimento</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filtros.de}
                  onChange={(e) => atualizarFiltros({ de: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                />
                <span className="text-gray-400 text-xs">até</span>
                <input
                  type="date"
                  value={filtros.ate}
                  onChange={(e) => atualizarFiltros({ ate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {(filtrosAtivos.length > 0 || filtros.parteId) && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {filtrosAtivos.map((f) => (
                <span key={f.chave} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded-full pl-2.5 pr-1 py-1">
                  {f.texto}
                  <button onClick={f.remover} className="rounded-full p-0.5 hover:bg-gray-200" aria-label={`Remover filtro ${f.texto}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              {temFiltroAlemDoStatus && (
                <button onClick={limparTudo} className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{erro}</div>}

          {aviso && (
            <div
              className={`flex items-start justify-between gap-2 rounded-lg p-3 mb-3 text-sm border ${
                aviso.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <span>{aviso.texto}</span>
              <button onClick={() => setAviso(null)} className="flex-shrink-0 p-0.5 rounded hover:bg-black/5" aria-label="Fechar aviso">
                <X size={14} />
              </button>
            </div>
          )}

          {!loading && lancamentos.length > 0 && (
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-xs text-gray-500">
                {total} lançamento{total > 1 ? 's' : ''} · total {formatBRL(totalDoFiltro)}
                {filtros.status === 'todas' && resumo && (
                  <span>
                    {' '}· em aberto {formatBRL(resumo.aberto.total)} ({resumo.aberto.quantidade}) · pago {formatBRL(resumo.pago.total)} ({resumo.pago.quantidade})
                  </span>
                )}
                {nomeFornecedor && <span> · {nomeFornecedor}</span>}
              </p>
              {podeSelecionar && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {modoSelecao && (
                    <button onClick={alternarTodas} className="text-xs text-pink-700 font-semibold hover:underline">
                      {selecionados.size === abertasNaTela.length ? 'Desmarcar todas' : `Marcar todas (${abertasNaTela.length})`}
                    </button>
                  )}
                  <button
                    onClick={() => (modoSelecao ? sairDaSelecao() : setModoSelecao(true))}
                    className={`text-xs px-3 py-1 rounded-full border font-semibold ${
                      modoSelecao ? 'bg-gray-800 text-white border-transparent' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {modoSelecao ? 'Concluir seleção' : 'Selecionar'}
                  </button>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : lancamentos.length === 0 ? (
            <EmptyState
              title="Nada por aqui"
              description={
                filtros.q
                  ? `Nenhum lançamento encontrado para "${filtros.q}"`
                  : temFiltroAlemDoStatus
                    ? 'Nenhum lançamento com esses filtros'
                    : 'Nenhum lançamento neste filtro'
              }
            />
          ) : grupos ? (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.chave}>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    {modoSelecao && ehAdmin && (
                      <input
                        type="checkbox"
                        checked={g.itens.length > 0 && g.itens.every((l) => selecionados.has(l.id))}
                        onChange={() => alternarGrupo(g.itens)}
                        aria-label={`Selecionar todas de ${g.label}`}
                        className="h-4 w-4 accent-pink-700"
                      />
                    )}
                    {g.corBadge &&<span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${g.corBadge}`}>{g.label}</span>}
                    {!g.corBadge && <h3 className="text-sm font-semibold text-gray-700">{g.label}</h3>}
                    <span className="text-xs text-gray-400 ml-auto">
                      {g.itens.length} · {formatBRL(g.subtotal)}
                    </span>
                  </div>
                  <div className="space-y-2">{g.itens.map(renderCard)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">{lancamentos.map(renderCard)}</div>
          )}

          {!loading && paginado && lancamentos.length < total && (
            <div className="mt-4 text-center">
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {carregandoMais && <Loader size={14} className="animate-spin" />}
                Carregar mais ({total - lancamentos.length} restantes)
              </button>
            </div>
          )}
        </div>
      </div>

      {ehAdmin && selecionadasObjs.length > 0 && (
        <DespesasAcoesLote selecionadas={selecionadasObjs} onLimpar={() => setSelecionados(new Set())} onConcluido={concluirLote} />
      )}
    </ProtectedRoute>
  )
}

export default function DespesasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>}>
      <DespesasContent />
    </Suspense>
  )
}
