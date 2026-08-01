'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { supabase } from '@/lib/supabase'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { FinanceiroParte, FinanceiroConta, FinanceiroOrcamentoItem } from '@/lib/types'
import { hojeISO, mesEncerrado, somarMeses } from '@/lib/financeiro-utils'
import {
  buscarFluxoMensal,
  buscarDespesasFixasFuturas,
  buscarSaldosFinaisDoMes,
  metaDiariaDeWeekdays,
  entradaPrevistaDeWeekdays,
  calcularDeltaEGap,
  calcularSaldoDiarioEAcumulado,
  compararOrcado,
  gerarEventosForecastOrcamento,
  somarEventosPorDia,
  FluxoMensalResultado,
  LinhaDespesaFixaFutura,
  FluxoMensalOrcadoRealizado,
} from '@/lib/financeiro-fluxo-mensal'
import { buscarOrcamento, salvarOrcamento, salvarItensOrcamento, ItemOrcamentoPayload } from '@/lib/financeiro-orcamento'
import OrcamentoGradeSemanal from '@/components/OrcamentoGradeSemanal'
import OrcamentoItensVariaveis, { ItemOrcamentoVariavel } from '@/components/OrcamentoItensVariaveis'
import DespesaFixaQuickEditModal from '@/components/DespesaFixaQuickEditModal'
import { Check, ChevronLeft, ChevronRight, Copy, Plus } from 'lucide-react'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Step = 1 | 2 | 3 | 4 | 5
const STEPS: { num: Step; icon: string; label: string }[] = [
  { num: 1, icon: '🎯', label: 'Meta de Venda' },
  { num: 2, icon: '💰', label: 'Entradas de Caixa' },
  { num: 3, icon: '📌', label: 'Despesas Fixas' },
  { num: 4, icon: '🧾', label: 'Variáveis' },
  { num: 5, icon: '✅', label: 'Revisão' },
]

const LOJAS: { id: 'loja1' | 'loja2'; label: string }[] = [
  { id: 'loja1', label: UNIDADE_LABEL.loja1 },
  { id: 'loja2', label: UNIDADE_LABEL.loja2 },
]

function vazioSemana(): (number | null)[] {
  return new Array(7).fill(null)
}

function corTexto(cor: 'azul' | 'laranja' | 'verde'): string {
  if (cor === 'verde') return 'text-green-600 font-semibold'
  if (cor === 'laranja') return 'text-amber-600 font-semibold'
  return 'text-blue-600 font-semibold'
}

function mapearItens(itens: FinanceiroOrcamentoItem[] | undefined): ItemOrcamentoVariavel[] {
  return (itens || []).map((i) => ({
    tipo: i.tipo as 'despesa' | 'compra_insumos',
    id: (i.tipo === 'despesa' ? i.conta_id : i.parte_id) || '',
    nome: i.tipo === 'despesa' ? i.conta?.nome || '—' : i.parte?.nome || '—',
    valor_previsto: i.valor_previsto,
    diaSemana: i.dia_semana ?? null,
    dataEspecifica: i.data_especifica ?? null,
  }))
}

// Orçamento do mês anterior, guardado só pra alimentar os botões "Copiar de
// <mês>" — nunca é aplicado sozinho, sempre depende de um clique explícito.
interface OrcamentoAnterior {
  metaVenda: Record<string, (number | null)[]>
  entradaPrevista: Record<string, (number | null)[]>
  itens: ItemOrcamentoVariavel[]
}

/** Uma linha do "Caixa do mês" na Revisão (saldo inicial + entradas − saídas = projetado). */
function LinhaCaixa({
  rotulo,
  detalhe,
  valor,
  cor,
  destaque,
  vazioLabel,
}: {
  rotulo: string
  detalhe?: string
  valor: number | null
  cor?: 'verde' | 'vermelho'
  destaque?: boolean
  vazioLabel?: string
}) {
  const corValor =
    valor == null
      ? 'text-amber-600'
      : destaque
        ? valor >= 0 ? 'text-green-600' : 'text-red-600'
        : cor === 'verde' ? 'text-green-600' : cor === 'vermelho' ? 'text-red-600' : 'text-gray-800'
  return (
    <div className={`flex items-start justify-between gap-3 px-4 py-3 ${destaque ? 'bg-gray-50' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm ${destaque ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>{rotulo}</p>
        {detalhe && <p className="text-[11px] text-gray-400 mt-0.5">{detalhe}</p>}
      </div>
      <p className={`font-bold whitespace-nowrap ${destaque ? 'text-lg' : 'text-sm'} ${corValor}`}>
        {valor != null ? formatBRL(valor) : vazioLabel || '—'}
      </p>
    </div>
  )
}

function OrcamentoWizardContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const hoje = new Date()

  const ano = Number(params.get('ano')) || hoje.getFullYear()
  const mes = Number(params.get('mes')) || hoje.getMonth() + 1
  const bloqueado = mesEncerrado(ano, mes)
  const stepInicial = Number(params.get('step'))

  const [step, setStep] = useState<Step>(stepInicial >= 1 && stepInicial <= 5 ? (stepInicial as Step) : 1)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // Marca qualquer edição não salva — usado só pra avisar antes de sair
  // (botão voltar / fechar aba), não impede trocar de step (nada se perde
  // ao trocar, tudo fica no estado do componente pai).
  const [alterado, setAlterado] = useState(false)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)

  const [metaVenda, setMetaVenda] = useState<Record<string, (number | null)[]>>({ loja1: vazioSemana(), loja2: vazioSemana() })
  const [entradaPrevista, setEntradaPrevista] = useState<Record<string, (number | null)[]>>({ loja1: vazioSemana(), loja2: vazioSemana() })
  const [saldoInicial, setSaldoInicial] = useState<Record<string, string>>({ loja1: '', loja2: '' })
  const [itensVariaveis, setItensVariaveis] = useState<ItemOrcamentoVariavel[]>([])

  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [despesasFixas, setDespesasFixas] = useState<{ itens: LinhaDespesaFixaFutura[]; total: number } | null>(null)
  const [dadosFluxo, setDadosFluxo] = useState<FluxoMensalResultado | null>(null)
  // Sugestão (nunca preenchimento automático) do saldo inicial deste mês —
  // saldo final calculado do mês anterior, por loja.
  const [sugestaoSaldoAnterior, setSugestaoSaldoAnterior] = useState<Record<string, number | null>>({ loja1: null, loja2: null })
  const [orcamentoAnterior, setOrcamentoAnterior] = useState<OrcamentoAnterior | null>(null)
  const [edicaoRapida, setEdicaoRapida] = useState<LinhaDespesaFixaFutura | null>(null)

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!alterado) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [alterado])

  function voltar() {
    if (alterado && !window.confirm('Você tem alterações não salvas neste orçamento. Sair mesmo assim?')) return
    router.push(`/financeiro/fluxo-caixa?ano=${ano}&mes=${mes}`)
  }

  useEffect(() => {
    supabase.from('financeiro_partes').select('*').eq('papel_fornecedor', true).eq('ativo', true).order('nome').then(({ data }) => setFornecedores(data || []))
    supabase.from('financeiro_contas').select('*').eq('ativo', true).order('codigo').then(({ data }) => setContas(data || []))
  }, [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const anoAnterior = mes === 1 ? ano - 1 : ano
      const mesAnterior = mes === 1 ? 12 : mes - 1
      const [orcLoja1, orcLoja2, orcGeral, fixas, fluxo, saldosAnteriores, antLoja1, antLoja2, antGeral] = await Promise.all([
        buscarOrcamento(ano, mes, 'loja1'),
        buscarOrcamento(ano, mes, 'loja2'),
        buscarOrcamento(ano, mes, 'geral'),
        buscarDespesasFixasFuturas('consolidado', ano, mes),
        buscarFluxoMensal('consolidado', ano, mes),
        buscarSaldosFinaisDoMes(anoAnterior, mesAnterior),
        buscarOrcamento(anoAnterior, mesAnterior, 'loja1'),
        buscarOrcamento(anoAnterior, mesAnterior, 'loja2'),
        buscarOrcamento(anoAnterior, mesAnterior, 'geral'),
      ])
      setSugestaoSaldoAnterior(saldosAnteriores)
      setMetaVenda({
        loja1: orcLoja1?.metaVendaPorDiaSemana || vazioSemana(),
        loja2: orcLoja2?.metaVendaPorDiaSemana || vazioSemana(),
      })
      setEntradaPrevista({
        loja1: orcLoja1?.entradaPrevistaPorDiaSemana || vazioSemana(),
        loja2: orcLoja2?.entradaPrevistaPorDiaSemana || vazioSemana(),
      })
      setSaldoInicial({
        loja1: orcLoja1?.saldo_inicial != null ? String(orcLoja1.saldo_inicial) : '',
        loja2: orcLoja2?.saldo_inicial != null ? String(orcLoja2.saldo_inicial) : '',
      })
      setItensVariaveis(mapearItens(orcGeral?.itens))

      const anteriorMeta = {
        loja1: antLoja1?.metaVendaPorDiaSemana || vazioSemana(),
        loja2: antLoja2?.metaVendaPorDiaSemana || vazioSemana(),
      }
      const anteriorEntrada = {
        loja1: antLoja1?.entradaPrevistaPorDiaSemana || vazioSemana(),
        loja2: antLoja2?.entradaPrevistaPorDiaSemana || vazioSemana(),
      }
      const anteriorItens = mapearItens(antGeral?.itens)
      const temAnterior =
        [...Object.values(anteriorMeta), ...Object.values(anteriorEntrada)].some((valores) => valores.some((v) => v != null)) ||
        anteriorItens.length > 0
      setOrcamentoAnterior(temAnterior ? { metaVenda: anteriorMeta, entradaPrevista: anteriorEntrada, itens: anteriorItens } : null)

      setDespesasFixas(fixas)
      setDadosFluxo(fluxo)
      setAlterado(false)
      setSalvoEm(null)
    } catch (err: any) {
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Só a lista de Despesas Fixas — evita re-buscar orçamento/fluxo/saldo
  // inteiros depois de um ajuste rápido de status/data/valor.
  async function recarregarDespesasFixas() {
    const fixas = await buscarDespesasFixasFuturas('consolidado', ano, mes)
    setDespesasFixas(fixas)
  }

  function mudarMeta(lojaId: string, diaSemana: number, valor: number | null) {
    setAlterado(true)
    setMetaVenda((prev) => ({ ...prev, [lojaId]: prev[lojaId].map((v, i) => (i === diaSemana ? valor : v)) }))
  }
  function mudarEntrada(lojaId: string, diaSemana: number, valor: number | null) {
    setAlterado(true)
    setEntradaPrevista((prev) => ({ ...prev, [lojaId]: prev[lojaId].map((v, i) => (i === diaSemana ? valor : v)) }))
  }
  function usarSaldoSugerido(lojaId: string, valor: number) {
    setAlterado(true)
    setSaldoInicial((prev) => ({ ...prev, [lojaId]: String(valor) }))
  }

  const dias = dadosFluxo?.dias || []
  const hojeStr = hojeISO()
  const mesAnteriorNum = mes === 1 ? 12 : mes - 1
  const labelMesAnterior = MESES[mesAnteriorNum - 1]

  const temMetaPreenchida = LOJAS.some((l) => (metaVenda[l.id] || []).some((v) => v != null))
  const temEntradaPreenchida = LOJAS.some((l) => (entradaPrevista[l.id] || []).some((v) => v != null))
  const temSaldoInicial = Boolean(saldoInicial.loja1 || saldoInicial.loja2)

  // --- Copiar do mês anterior ------------------------------------------------
  // Refazer 14 metas + 14 previsões + os itens variáveis à mão todo mês é o
  // maior atrito do wizard; ERPs de orçamento partem sempre do período
  // anterior (QuickBooks: "create budget from previous year's data"). Aqui é
  // sempre por passo e sempre com confirmação quando já existe conteúdo.
  function confirmarSobrescrita(temConteudo: boolean): boolean {
    return !temConteudo || window.confirm(`Isso substitui o que já está preenchido aqui pelos valores de ${labelMesAnterior}. Continuar?`)
  }

  function copiarMetas() {
    if (!orcamentoAnterior || !confirmarSobrescrita(temMetaPreenchida)) return
    setAlterado(true)
    setMetaVenda({ loja1: [...orcamentoAnterior.metaVenda.loja1], loja2: [...orcamentoAnterior.metaVenda.loja2] })
  }

  function copiarEntradas() {
    if (!orcamentoAnterior || !confirmarSobrescrita(temEntradaPreenchida)) return
    setAlterado(true)
    setEntradaPrevista({ loja1: [...orcamentoAnterior.entradaPrevista.loja1], loja2: [...orcamentoAnterior.entradaPrevista.loja2] })
  }

  function copiarItens() {
    if (!orcamentoAnterior || !confirmarSobrescrita(itensVariaveis.length > 0)) return
    setAlterado(true)
    // Item marcado numa data específica é remarcado pro mesmo dia deste mês
    // (somarMeses clampa 31→30/28); o que não couber no mês é descartado.
    setItensVariaveis(
      orcamentoAnterior.itens
        .map((i) => ({ ...i, dataEspecifica: i.dataEspecifica ? somarMeses(i.dataEspecifica, 1) : null }))
        .filter((i) => !i.dataEspecifica || dias.includes(i.dataEspecifica))
    )
  }

  function botaoCopiar(onClick: () => void) {
    if (bloqueado || !orcamentoAnterior) return null
    return (
      <button
        type="button"
        onClick={onClick}
        className="border-2 border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:border-gray-300 whitespace-nowrap"
      >
        <Copy size={15} /> Copiar de {labelMesAnterior}
      </button>
    )
  }

  // --- Prévia ao vivo (Revisão) — reaproveita as MESMAS funções puras que
  // o calendário usa, em cima do rascunho ainda não salvo + o que já é
  // real (dadosFluxo), pra nunca divergir do que vai aparecer depois de
  // salvar. ------------------------------------------------------------------
  const metaDiariaDraft = metaDiariaDeWeekdays(
    [{ metaVendaPorDiaSemana: metaVenda.loja1 }, { metaVendaPorDiaSemana: metaVenda.loja2 }],
    dias
  )
  const metaMensalDraft = metaDiariaDraft.some((v) => v != null) ? metaDiariaDraft.reduce((s: number, v) => s + (v || 0), 0) : null
  const diasSemMeta = metaDiariaDraft.filter((v) => v == null).length
  const { gapAcumuladoPorDia } = calcularDeltaEGap(dadosFluxo?.faturamentoPorDia || [], metaDiariaDraft)
  const gapFinal = gapAcumuladoPorDia[gapAcumuladoPorDia.length - 1] ?? null

  const entradaPrevistaDraftPorDia = entradaPrevistaDeWeekdays(
    [{ entradaPrevistaPorDiaSemana: entradaPrevista.loja1 }, { entradaPrevistaPorDiaSemana: entradaPrevista.loja2 }],
    dias
  )
  const diasSemEntrada = entradaPrevistaDraftPorDia.filter((v) => v == null).length
  const entradasCaixaPorDiaDraft = dias.map((d, i) => (d <= hojeStr ? dadosFluxo?.entradasCaixaPorDia[i] ?? 0 : entradaPrevistaDraftPorDia[i]))
  const totalEntradasDraft = entradasCaixaPorDiaDraft.reduce((s: number, v) => s + (v || 0), 0)
  const entradasRealizadoDraft = dias.reduce((s, d, i) => (d <= hojeStr ? s + (dadosFluxo?.entradasCaixaPorDia[i] || 0) : s), 0)
  const entradasPrevistoDraft = totalEntradasDraft - entradasRealizadoDraft

  const saldoInicialDraft = (() => {
    const l1 = saldoInicial.loja1 ? Number(saldoInicial.loja1) : null
    const l2 = saldoInicial.loja2 ? Number(saldoInicial.loja2) : null
    if (l1 == null && l2 == null) return null
    return (l1 || 0) + (l2 || 0)
  })()

  const itensVariaveisComoPrevisto = itensVariaveis.map((i) => ({
    tipo: i.tipo,
    parte_id: i.tipo === 'compra_insumos' ? i.id : undefined,
    conta_id: i.tipo === 'despesa' ? i.id : undefined,
    valor_previsto: i.valor_previsto,
    dia_semana: i.diaSemana,
    data_especifica: i.dataEspecifica,
  }))

  // Comparação orçado x realizado usa as agregações REALIZADO (sem
  // previsão), senão compararia o orçamento com ele mesmo.
  const orcadoXRealizadoDraft: FluxoMensalOrcadoRealizado[] = dadosFluxo
    ? [
        ...compararOrcado(itensVariaveisComoPrevisto, 'despesa', dadosFluxo.saidasFixoPorContaRealizado, 'conta_id', dias),
        ...compararOrcado(itensVariaveisComoPrevisto, 'compra_insumos', dadosFluxo.saidasVariavelPorFornecedorRealizado, 'parte_id', dias),
      ]
    : []

  // Saldo Projetado: parte do REALIZADO (sem a previsão salva no banco) e
  // injeta a previsão do RASCUNHO por cima — assim reflete edições ainda
  // não salvas, igual buscarFluxoMensal faria depois de salvar.
  const eventosForecastDraft = dadosFluxo
    ? gerarEventosForecastOrcamento(itensVariaveisComoPrevisto, dadosFluxo.saidasFixoPorContaRealizado, dadosFluxo.saidasVariavelPorFornecedorRealizado, dias, hojeStr)
    : []
  const forecastPorDiaDraft = somarEventosPorDia(eventosForecastDraft, dias)
  const saidasPorDiaDraft = dias.map((_, i) => (dadosFluxo?.saidasPorDiaRealizado[i] || 0) + forecastPorDiaDraft[i])
  const saidasRealizadoDraft = (dadosFluxo?.saidasPorDiaRealizado || []).reduce((s: number, v) => s + v, 0)
  const saidasPrevistoDraft = forecastPorDiaDraft.reduce((s: number, v) => s + v, 0)
  const totalSaidasDraft = saidasRealizadoDraft + saidasPrevistoDraft
  const { saldoAcumuladoPorDia } = calcularSaldoDiarioEAcumulado(entradasCaixaPorDiaDraft, saidasPorDiaDraft, saldoInicialDraft)
  const saldoProjetado = saldoAcumuladoPorDia.length > 0 ? saldoAcumuladoPorDia[saldoAcumuladoPorDia.length - 1] : null

  const fixasLancadas = (despesasFixas?.itens || []).filter((i) => i.origem === 'lancamento')
  const fixasRecorrencia = (despesasFixas?.itens || []).filter((i) => i.origem === 'recorrencia')
  const totalFixasLancadas = fixasLancadas.reduce((s, i) => s + i.valor, 0)
  const totalFixasRecorrencia = fixasRecorrencia.reduce((s, i) => s + i.valor, 0)

  // Sinaliza nas abas o que ainda falta preencher — sem isso só dá pra
  // saber que o passo 2 está vazio entrando nele.
  function indicadorStep(num: Step): 'ok' | 'pendente' | null {
    if (loading) return null
    if (num === 1) return temMetaPreenchida ? 'ok' : 'pendente'
    if (num === 2) return temSaldoInicial && temEntradaPreenchida ? 'ok' : 'pendente'
    if (num === 4) return itensVariaveis.length > 0 ? 'ok' : null
    return null
  }

  async function salvar(sair: boolean) {
    if (!usuario) return
    setSalvando(true)
    setErro('')
    try {
      await salvarOrcamento(
        ano, mes, 'loja1',
        { metaVendaPorDiaSemana: metaVenda.loja1, entradaPrevistaPorDiaSemana: entradaPrevista.loja1, saldo_inicial: saldoInicial.loja1 ? Number(saldoInicial.loja1) : null },
        usuario.id
      )
      await salvarOrcamento(
        ano, mes, 'loja2',
        { metaVendaPorDiaSemana: metaVenda.loja2, entradaPrevistaPorDiaSemana: entradaPrevista.loja2, saldo_inicial: saldoInicial.loja2 ? Number(saldoInicial.loja2) : null },
        usuario.id
      )
      const geralId = await salvarOrcamento(ano, mes, 'geral', { metaVendaPorDiaSemana: vazioSemana(), entradaPrevistaPorDiaSemana: vazioSemana(), saldo_inicial: null }, usuario.id)
      const payload: ItemOrcamentoPayload[] = itensVariaveis.map((i) => ({
        tipo: i.tipo,
        parte_id: i.tipo === 'compra_insumos' ? i.id : null,
        conta_id: i.tipo === 'despesa' ? i.id : null,
        valor_previsto: i.valor_previsto,
        dia_semana: i.diaSemana,
        data_especifica: i.dataEspecifica,
        observacao: null,
      }))
      await salvarItensOrcamento(geralId, payload)
      setAlterado(false)
      if (sair) {
        router.push(`/financeiro/fluxo-caixa?ano=${ano}&mes=${mes}`)
        return
      }
      setSalvoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setSalvando(false)
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-36">
        <div className="sticky top-0 z-10">
          <PageHeader
            title={`Orçamento — ${MESES[mes - 1]} de ${ano}`}
            subtitle={
              <>
                <span className="text-gray-400">Financeiro / Fluxo de Caixa / Orçamento</span>
                {bloqueado && <span className="text-amber-600 font-medium ml-2">· Mês encerrado — somente leitura</span>}
              </>
            }
            onBack={voltar}
            maxWidth="max-w-4xl"
          />
          <div className="bg-white border-b border-gray-200 px-4 pb-3">
            <div className="max-w-4xl mx-auto flex gap-2 flex-wrap">
              {STEPS.map((s) => {
                const indicador = indicadorStep(s.num)
                return (
                  <button
                    key={s.num}
                    onClick={() => setStep(s.num)}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-1.5 ${
                      step === s.num ? 'bg-pink-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{s.icon} {s.label}</span>
                    {indicador === 'ok' && <Check size={13} className={step === s.num ? 'text-white' : 'text-green-600'} />}
                    {indicador === 'pendente' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Ainda não preenchido" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">Carregando...</div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Meta de Venda por loja</h2>
                      <p className="text-sm text-gray-500 mt-1">Quanto cada loja deve vender em cada dia da semana — o padrão que a equipe é cobrada em cima.</p>
                      <p className="text-xs text-gray-400 mt-1">É venda (faturamento), não é dinheiro entrando no caixa — isso é o passo 2.</p>
                    </div>
                    {botaoCopiar(copiarMetas)}
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-medium text-gray-700">
                      Meta total do mês: <span className="font-bold text-gray-900">{metaMensalDraft != null ? formatBRL(metaMensalDraft) : '—'}</span>
                    </p>
                    {diasSemMeta > 0 && <p className="text-xs text-amber-600 mt-1">{diasSemMeta} dia(s) do mês sem meta — não entram na conta do GAP</p>}
                  </div>
                  <OrcamentoGradeSemanal lojas={LOJAS} valores={metaVenda} onChange={mudarMeta} readOnly={bloqueado} dias={dias} rotuloTotal="Meta no mês" />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Entradas de Caixa</h2>
                      <p className="text-sm text-gray-500 mt-1">Saldo inicial do mês e previsão de entrada em caixa por dia da semana — usada pros dias futuros do calendário.</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Diferente da Meta de Venda: aqui é o dinheiro que efetivamente cai no caixa/conta no dia (dinheiro, PIX, repasse de cartão), que pode ser maior ou menor que a venda do dia.
                      </p>
                    </div>
                    {botaoCopiar(copiarEntradas)}
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Saldo inicial — quanto tem em caixa/conta no dia 1</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {LOJAS.map((loja) => {
                        const sugestao = sugestaoSaldoAnterior[loja.id]
                        const atual = saldoInicial[loja.id] ? Number(saldoInicial[loja.id]) : null
                        const igualSugestao = sugestao != null && atual != null && Math.abs(atual - sugestao) < 0.005
                        return (
                          <div key={loja.id}>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">{loja.label}</label>
                            {bloqueado ? (
                              <p className="text-sm text-gray-800">{saldoInicial[loja.id] ? formatBRL(Number(saldoInicial[loja.id])) : '—'}</p>
                            ) : (
                              <>
                                <input
                                  type="number" step="0.01" value={saldoInicial[loja.id]}
                                  onChange={(e) => { setAlterado(true); setSaldoInicial((prev) => ({ ...prev, [loja.id]: e.target.value })) }}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  placeholder="0,00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                />
                                {sugestao != null && (
                                  <p className="text-[11px] text-gray-400 mt-1">
                                    Fechamento de {labelMesAnterior}: {formatBRL(sugestao)}
                                    {!igualSugestao && (
                                      <button
                                        type="button"
                                        onClick={() => usarSaldoSugerido(loja.id, sugestao)}
                                        className="ml-1.5 text-pink-700 hover:text-pink-800 font-semibold"
                                      >
                                        usar
                                      </button>
                                    )}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {!temSaldoInicial && (
                      <p className="text-xs text-amber-600 mt-2">
                        Sem saldo inicial o Saldo Acumulado do calendário parte de zero e não representa o caixa de verdade.
                      </p>
                    )}
                  </div>
                  {diasSemEntrada > 0 && (
                    <p className="text-xs text-amber-600">{diasSemEntrada} dia(s) do mês sem previsão cadastrada — vão aparecer como "—" no calendário.</p>
                  )}
                  <OrcamentoGradeSemanal lojas={LOJAS} valores={entradaPrevista} onChange={mudarEntrada} readOnly={bloqueado} dias={dias} rotuloTotal="Previsto no mês" />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Despesas Fixas</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Somente leitura — sai do que já está no sistema com vencimento de hoje em diante. Se é previsível, lance como despesa de verdade; não tem campo de previsão manual aqui.
                      </p>
                    </div>
                    {!bloqueado && (
                      <Link
                        href="/financeiro/despesas/nova"
                        className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800 whitespace-nowrap"
                      >
                        <Plus size={16} /> Lançar despesa
                      </Link>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Já lançadas</p>
                      <p className="font-bold text-gray-800">{formatBRL(totalFixasLancadas)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Previstas por recorrência</p>
                      <p className="font-bold text-purple-700">{formatBRL(totalFixasRecorrencia)}</p>
                    </div>
                    <div className="border-l border-gray-100 pl-6">
                      <p className="text-xs text-gray-500">Total a vencer no mês</p>
                      <p className="font-bold text-gray-900">{formatBRL(despesasFixas?.total || 0)}</p>
                    </div>
                  </div>

                  <div>
                    {despesasFixas && despesasFixas.itens.length > 0 ? (
                      <div className="space-y-1">
                        {despesasFixas.itens.map((item, i) => (
                          <div
                            key={i}
                            onClick={item.id && !bloqueado ? () => setEdicaoRapida(item) : undefined}
                            className={`flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm ${
                              item.id && !bloqueado ? 'cursor-pointer hover:bg-gray-100' : ''
                            }`}
                          >
                            <span className="text-gray-700">
                              {item.parteNome} — {item.contaNome}
                              <span className="ml-1.5 text-[10px] text-gray-400">{new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                              {/* Sem essa marca não dá pra saber se a linha é
                                  um lançamento real ou a próxima ocorrência
                                  ainda não gerada de uma recorrência ativa. */}
                              {item.origem === 'recorrencia' && (
                                <span className="ml-1.5 text-[10px] font-semibold text-purple-600">previsto · recorrência</span>
                              )}
                            </span>
                            <span className="font-semibold text-gray-800">{formatBRL(item.valor)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Nenhuma despesa fixa a vencer no restante do mês.</p>
                    )}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Despesas Variáveis</h2>
                      <p className="text-sm text-gray-500 mt-1">Insumos, embalagens, despesas diversas — por fornecedor ou por conta (ex: pró-labore, distribuição de lucro).</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Com dia da semana ou data marcada, a previsão também aparece nos dias futuros do calendário do Fluxo de Caixa — e some sozinha quando o dia passa ou quando a despesa real for lançada.
                      </p>
                    </div>
                    {botaoCopiar(copiarItens)}
                  </div>
                  <OrcamentoItensVariaveis
                    itens={itensVariaveis}
                    onChange={(itens) => { setAlterado(true); setItensVariaveis(itens) }}
                    fornecedores={fornecedores}
                    contas={contas}
                    dias={dias}
                    readOnly={bloqueado}
                  />
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Revisão — como o mês vai terminar</h2>
                    <p className="text-sm text-gray-500 mt-1">Prévia ao vivo, combinando o que já é real com o que você acabou de cadastrar.</p>
                  </div>

                  {/* Mesma conta, na mesma ordem, que o calendário do Fluxo de
                      Caixa faz — em vez de 4 números soltos, o caminho até o
                      saldo projetado (padrão de qualquer fluxo de caixa
                      projetado: saldo inicial + entradas − saídas = saldo final). */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                      <p className="text-sm font-semibold text-gray-700">Caixa do mês</p>
                      <p className="text-[11px] text-gray-500">Realizado até hoje + o que você orçou daqui pra frente.</p>
                    </div>
                    <div className="divide-y divide-gray-100">
                      <LinhaCaixa
                        rotulo="Saldo inicial do mês"
                        detalhe={saldoInicialDraft == null ? 'Preencha no passo Entradas de Caixa — a conta abaixo está partindo de zero' : 'Informado no passo Entradas de Caixa'}
                        valor={saldoInicialDraft}
                        vazioLabel="não informado"
                      />
                      <LinhaCaixa
                        rotulo="+ Entradas de Caixa"
                        detalhe={`${formatBRL(entradasRealizadoDraft)} já realizado + ${formatBRL(entradasPrevistoDraft)} previsto${diasSemEntrada > 0 ? ` · ${diasSemEntrada} dia(s) sem previsão` : ''}`}
                        valor={totalEntradasDraft}
                        cor="verde"
                      />
                      <LinhaCaixa
                        rotulo="− Saídas"
                        detalhe={`${formatBRL(saidasRealizadoDraft)} já lançado (inclui fixas e recorrências) + ${formatBRL(saidasPrevistoDraft)} previsto neste orçamento`}
                        valor={totalSaidasDraft}
                        cor="vermelho"
                      />
                      <LinhaCaixa
                        rotulo="= Saldo projetado no fim do mês"
                        valor={saldoProjetado}
                        destaque
                        vazioLabel="Incompleto"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Meta de Venda do mês</p>
                      <p className="text-lg font-bold text-gray-800 mt-1">{metaMensalDraft != null ? formatBRL(metaMensalDraft) : '—'}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Meta por dia da semana aplicada a cada dia do mês.</p>
                      {diasSemMeta > 0 && <p className="text-[11px] text-amber-600">{diasSemMeta} dia(s) do mês sem meta</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">GAP Acumulado (fim do mês)</p>
                      <p className={`text-lg font-bold mt-1 ${gapFinal == null ? 'text-gray-400' : gapFinal >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                        {gapFinal != null ? formatBRL(gapFinal) : '—'}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {gapFinal == null
                          ? 'Sem meta cadastrada — cadastre no passo 1.'
                          : `Projeção de fechar ${gapFinal >= 0 ? 'acima' : 'abaixo'} da meta, somando o faturamento já realizado com a média histórica dos dias que faltam.`}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-medium text-gray-700">
                      Despesas Fixas conhecidas — <span className="font-bold">{formatBRL(despesasFixas?.total || 0)}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Já dentro das Saídas acima. Não tem orçado x realizado aqui porque não existe previsão manual de despesa fixa — só lançamento real.
                    </p>
                  </div>

                  {orcadoXRealizadoDraft.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Despesas Variáveis — orçado x realizado</p>
                      <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
                        {orcadoXRealizadoDraft.map((item) => (
                          <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-gray-700">{item.nome}</span>
                            <div className="text-right">
                              <p className={corTexto(item.cor)}>{formatBRL(item.projetado)}</p>
                              <p className="text-[10px] text-gray-400">orçado {formatBRL(item.previsto)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">Valor grande = já lançado/pago no mês; embaixo, o que você orçou.</p>
                    </div>
                  )}

                  {bloqueado && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-center">
                      Mês encerrado — orçamento é somente leitura.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Barra fixa de navegação — antes só dava pra avançar clicando nas
            abas, e o único botão de salvar ficava no passo 5 (quem preenchia
            os passos 1 e 2 e saía perdia tudo). bottom-[57px] = altura do
            BottomNav global (fixo, z-50), senão a barra fica escondida atrás
            dele. */}
        {!loading && (
          <div className="fixed bottom-[57px] left-0 right-0 bg-white border-t border-gray-200 z-20 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
                disabled={step === 1}
                className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border-2 border-gray-200 disabled:opacity-40 flex items-center gap-1 hover:border-gray-300"
              >
                <ChevronLeft size={16} /> Voltar
              </button>

              <div className="flex-1 text-center min-w-0">
                <p className="text-xs text-gray-400">Passo {step} de 5</p>
                {alterado && !bloqueado && <p className="text-[11px] text-amber-600 font-medium">Alterações não salvas</p>}
                {!alterado && salvoEm && <p className="text-[11px] text-green-600 font-medium">Salvo às {salvoEm}</p>}
              </div>

              {step < 5 ? (
                <>
                  {!bloqueado && (
                    <button
                      type="button"
                      onClick={() => salvar(false)}
                      disabled={salvando}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 border-2 border-gray-200 disabled:opacity-50 hover:border-gray-300 whitespace-nowrap"
                    >
                      {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep((s) => ((s + 1) as Step))}
                    className="bg-pink-700 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1 hover:bg-pink-800 whitespace-nowrap"
                  >
                    Avançar <ChevronRight size={16} />
                  </button>
                </>
              ) : (
                !bloqueado && (
                  <button
                    type="button"
                    onClick={() => salvar(true)}
                    disabled={salvando}
                    className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-2 hover:bg-green-700 whitespace-nowrap"
                  >
                    {salvando ? 'Salvando...' : (<><Check size={16} /> Salvar Orçamento</>)}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {edicaoRapida && edicaoRapida.id && (
        <DespesaFixaQuickEditModal
          id={edicaoRapida.id}
          descricao={`${edicaoRapida.parteNome} — ${edicaoRapida.contaNome}`}
          valorAtual={edicaoRapida.valor}
          vencimentoAtual={edicaoRapida.data}
          detalheHref={`/financeiro/despesas/${edicaoRapida.id}?voltarPara=${encodeURIComponent(`/financeiro/fluxo-caixa/orcamento?ano=${ano}&mes=${mes}&step=3`)}`}
          onClose={() => setEdicaoRapida(null)}
          onSalvo={recarregarDespesasFixas}
        />
      )}
    </ProtectedRoute>
  )
}

export default function OrcamentoWizardPage() {
  return (
    <Suspense>
      <OrcamentoWizardContent />
    </Suspense>
  )
}
