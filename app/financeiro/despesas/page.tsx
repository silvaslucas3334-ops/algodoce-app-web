'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'
import { Plus, Search, ReceiptText, ShoppingCart, CheckCircle, X } from 'lucide-react'
import { EtiquetaAprovacao, FinanceiroLancamento } from '@/lib/types'
import { UNIDADE_LABEL, STATUS_CONCILIACAO_LABEL, STATUS_CONCILIACAO_COLOR, ETIQUETA_APROVACAO_LABEL, ETIQUETA_APROVACAO_COLOR } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { hojeISO, somarDias, statusExibicao } from '@/lib/financeiro-utils'
import EtiquetaAprovacaoSeletor from '@/components/EtiquetaAprovacaoSeletor'

type Filtro = 'atrasadas' | 'vence7' | 'aberto' | 'pagas' | 'canceladas'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'vence7', label: 'Vence em 7 dias' },
  { key: 'aberto', label: 'Em aberto' },
  { key: 'pagas', label: 'Pagas' },
  { key: 'canceladas', label: 'Canceladas' },
]

type FiltroEtiqueta = 'todas' | 'sem_etiqueta' | EtiquetaAprovacao

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

type Agrupamento = 'mes' | 'etiqueta'

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

export default function DespesasPage() {
  const { usuario } = useAuth()
  const [lancamentos, setLancamentos] = useState<FinanceiroLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Filtro>('aberto')
  const [busca, setBusca] = useState('')
  const [pagandoId, setPagandoId] = useState<string | null>(null)
  const [mostrarMaisFiltros, setMostrarMaisFiltros] = useState(false)
  const [filtroParteId, setFiltroParteId] = useState('')
  const [filtroEtiqueta, setFiltroEtiqueta] = useState<FiltroEtiqueta>('todas')
  const [vencimentoDe, setVencimentoDe] = useState('')
  const [vencimentoAte, setVencimentoAte] = useState('')
  const [agrupamento, setAgrupamento] = useState<Agrupamento>('mes')

  useEffect(() => {
    if (usuario) carregar()
  }, [usuario, filtro])

  async function carregar() {
    setLoading(true)
    const hoje = hojeISO()
    let query = supabase
      .from('financeiro_lancamentos')
      .select(
        '*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome), extrato_transacao:financeiro_extrato_transacoes!extrato_transacao_id(status_conciliacao)'
      )

    if (filtro === 'atrasadas') {
      query = query.eq('status', 'aberto').lt('data_vencimento', hoje).order('data_vencimento')
    } else if (filtro === 'vence7') {
      query = query.eq('status', 'aberto').gte('data_vencimento', hoje).lte('data_vencimento', somarDias(hoje, 7)).order('data_vencimento')
    } else if (filtro === 'aberto') {
      query = query.eq('status', 'aberto').order('data_vencimento')
    } else if (filtro === 'pagas') {
      query = query.eq('status', 'pago').order('data_pagamento', { ascending: false })
    } else {
      query = query.eq('status', 'cancelado').order('updated_at', { ascending: false })
    }

    const { data, error } = await query
    if (error) console.error('Erro ao carregar despesas:', error)
    setLancamentos(data || [])
    setLoading(false)
  }

  async function marcarPago(l: FinanceiroLancamento) {
    setPagandoId(l.id)
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: hojeISO(), updated_at: new Date().toISOString() })
        .eq('id', l.id)
      if (error) throw error
      await carregar()
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

  const fornecedoresDisponiveis = Array.from(
    new Map(lancamentos.filter((l) => l.parte).map((l) => [l.parte_id, l.parte!.nome])).entries()
  )
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const filtrosSecundariosAtivos = !!filtroParteId || !!vencimentoDe || !!vencimentoAte
  function limparFiltrosSecundarios() {
    setFiltroParteId('')
    setVencimentoDe('')
    setVencimentoAte('')
  }

  const termo = busca.trim().toLowerCase()
  const filtradas = lancamentos.filter((l) => {
    if (termo) {
      const bate =
        l.descricao.toLowerCase().includes(termo) ||
        (l.parte?.nome || '').toLowerCase().includes(termo) ||
        (l.conta?.nome || '').toLowerCase().includes(termo)
      if (!bate) return false
    }
    if (filtroParteId && l.parte_id !== filtroParteId) return false
    if (filtroEtiqueta === 'sem_etiqueta' && l.etiqueta_aprovacao) return false
    if (filtroEtiqueta !== 'todas' && filtroEtiqueta !== 'sem_etiqueta' && l.etiqueta_aprovacao !== filtroEtiqueta) return false
    if (vencimentoDe && l.data_vencimento < vencimentoDe) return false
    if (vencimentoAte && l.data_vencimento > vencimentoAte) return false
    return true
  })

  const totalFiltrado = filtradas.reduce((acc, l) => acc + l.valor_total, 0)
  const grupos = filtro === 'aberto' ? (agrupamento === 'mes' ? agruparPorMes(filtradas) : agruparPorEtiqueta(filtradas)) : null

  function renderCard(l: FinanceiroLancamento) {
    const st = statusExibicao(l.status, l.data_vencimento, l.valor_pago_conciliado)
    return (
      <div key={l.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/financeiro/despesas/${l.id}`} className="flex-1 cursor-pointer">
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
            <p className="text-xs text-gray-400 mt-1">
              {l.status === 'pago' && l.data_pagamento
                ? `Paga em ${new Date(l.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}`
                : `Vencimento: ${new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}`}
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
            {usuario?.role === 'admin' && l.status === 'aberto' && (
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
            {l.status === 'aberto' && (
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
      <div className="min-h-screen bg-gray-50 pb-20">
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
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {FILTROS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${
                  filtro === f.key
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
                mostrarMaisFiltros || filtrosSecundariosAtivos
                  ? 'bg-gray-800 text-white border-transparent font-semibold'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              Mais filtros{filtrosSecundariosAtivos ? ' ·' : ''}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <span className="text-xs text-gray-400 flex-shrink-0">Etiqueta:</span>
            {FILTROS_ETIQUETA.map((f) => (
              <button
                key={f.key}
                onClick={() => setFiltroEtiqueta(f.key)}
                className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap border ${
                  filtroEtiqueta === f.key
                    ? 'bg-gray-800 text-white border-transparent font-semibold'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {f.label}
              </button>
            ))}
            {filtro === 'aberto' && (
              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                <span className="text-xs text-gray-400 mr-1">Agrupar:</span>
                {(['mes', 'etiqueta'] as Agrupamento[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAgrupamento(a)}
                    className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap border ${
                      agrupamento === a
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
            <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fornecedor</label>
                  <select
                    value={filtroParteId}
                    onChange={(e) => setFiltroParteId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="">Todos</option>
                    {fornecedoresDisponiveis.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vencimento</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={vencimentoDe}
                      onChange={(e) => setVencimentoDe(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                    />
                    <span className="text-gray-400 text-xs">até</span>
                    <input
                      type="date"
                      value={vencimentoAte}
                      onChange={(e) => setVencimentoAte(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {filtrosSecundariosAtivos && (
                <button
                  onClick={limparFiltrosSecundarios}
                  className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                >
                  <X size={12} /> Limpar esses filtros
                </button>
              )}
            </div>
          )}

          {!loading && filtradas.length > 0 && (
            <p className="text-xs text-gray-500 mb-3">
              {filtradas.length} lançamento{filtradas.length > 1 ? 's' : ''} · total {formatBRL(totalFiltrado)}
            </p>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <EmptyState
              title="Nada por aqui"
              description={busca ? `Nenhum lançamento encontrado para "${busca}"` : 'Nenhum lançamento neste filtro'}
            />
          ) : grupos ? (
            <div className="space-y-5">
              {grupos.map((g) => (
                <div key={g.chave}>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    {g.corBadge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${g.corBadge}`}>{g.label}</span>}
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
            <div className="space-y-2">{filtradas.map(renderCard)}</div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
