'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { supabase } from '@/lib/supabase'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { FinanceiroParte, FinanceiroConta } from '@/lib/types'
import { hojeISO, mesEncerrado } from '@/lib/financeiro-utils'
import {
  buscarFluxoMensal,
  buscarDespesasFixasFuturas,
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
import { buscarOrcamento, salvarOrcamento, salvarItensOrcamento, buscarRecorrenciasAtivas, ItemOrcamentoPayload } from '@/lib/financeiro-orcamento'
import OrcamentoGradeSemanal from '@/components/OrcamentoGradeSemanal'
import OrcamentoItensVariaveis, { ItemOrcamentoVariavel } from '@/components/OrcamentoItensVariaveis'
import { ArrowLeft, Check, Plus } from 'lucide-react'

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

function OrcamentoWizardContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const hoje = new Date()

  const ano = Number(params.get('ano')) || hoje.getFullYear()
  const mes = Number(params.get('mes')) || hoje.getMonth() + 1
  const bloqueado = mesEncerrado(ano, mes)

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [metaVenda, setMetaVenda] = useState<Record<string, (number | null)[]>>({ loja1: vazioSemana(), loja2: vazioSemana() })
  const [entradaPrevista, setEntradaPrevista] = useState<Record<string, (number | null)[]>>({ loja1: vazioSemana(), loja2: vazioSemana() })
  const [saldoInicial, setSaldoInicial] = useState<Record<string, string>>({ loja1: '', loja2: '' })
  const [itensVariaveis, setItensVariaveis] = useState<ItemOrcamentoVariavel[]>([])

  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [despesasFixas, setDespesasFixas] = useState<{ itens: LinhaDespesaFixaFutura[]; total: number } | null>(null)
  const [recorrencias, setRecorrencias] = useState<{ nome: string; valor: number; diaVencimento: number }[]>([])
  const [dadosFluxo, setDadosFluxo] = useState<FluxoMensalResultado | null>(null)

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
      const [orcLoja1, orcLoja2, orcGeral, recs, fixas, fluxo] = await Promise.all([
        buscarOrcamento(ano, mes, 'loja1'),
        buscarOrcamento(ano, mes, 'loja2'),
        buscarOrcamento(ano, mes, 'geral'),
        buscarRecorrenciasAtivas(),
        buscarDespesasFixasFuturas('consolidado', ano, mes),
        buscarFluxoMensal('consolidado', ano, mes),
      ])
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
      setItensVariaveis(
        (orcGeral?.itens || []).map((i) => ({
          tipo: i.tipo as 'despesa' | 'compra_insumos',
          id: (i.tipo === 'despesa' ? i.conta_id : i.parte_id) || '',
          nome: i.tipo === 'despesa' ? i.conta?.nome || '—' : i.parte?.nome || '—',
          valor_previsto: i.valor_previsto,
          diaSemana: i.dia_semana ?? null,
          dataEspecifica: i.data_especifica ?? null,
        }))
      )
      setRecorrencias((recs || []).map((r) => ({ nome: r.parte?.nome || r.descricao, valor: r.valor, diaVencimento: r.dia_vencimento })))
      setDespesasFixas(fixas)
      setDadosFluxo(fluxo)
    } catch (err: any) {
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  function mudarMeta(lojaId: string, diaSemana: number, valor: number | null) {
    setMetaVenda((prev) => ({ ...prev, [lojaId]: prev[lojaId].map((v, i) => (i === diaSemana ? valor : v)) }))
  }
  function mudarEntrada(lojaId: string, diaSemana: number, valor: number | null) {
    setEntradaPrevista((prev) => ({ ...prev, [lojaId]: prev[lojaId].map((v, i) => (i === diaSemana ? valor : v)) }))
  }

  // --- Prévia ao vivo (Revisão) — reaproveita as MESMAS funções puras que
  // o calendário usa, em cima do rascunho ainda não salvo + o que já é
  // real (dadosFluxo), pra nunca divergir do que vai aparecer depois de
  // salvar. ------------------------------------------------------------------
  const dias = dadosFluxo?.dias || []
  const hojeStr = hojeISO()

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
  const { saldoAcumuladoPorDia } = calcularSaldoDiarioEAcumulado(entradasCaixaPorDiaDraft, saidasPorDiaDraft, saldoInicialDraft)
  const saldoProjetado = saldoAcumuladoPorDia.length > 0 ? saldoAcumuladoPorDia[saldoAcumuladoPorDia.length - 1] : null

  async function salvar() {
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
      router.push(`/financeiro/fluxo-caixa?ano=${ano}&mes=${mes}`)
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push(`/financeiro/fluxo-caixa?ano=${ano}&mes=${mes}`)} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Orçamento — {MESES[mes - 1]} de {ano}</h1>
              {bloqueado && <p className="text-xs text-amber-600 font-medium">Mês encerrado — somente leitura</p>}
            </div>
          </div>
          <div className="max-w-4xl mx-auto px-4 pb-3 flex gap-2 flex-wrap">
            {STEPS.map((s) => (
              <button
                key={s.num}
                onClick={() => setStep(s.num)}
                className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                  step === s.num ? 'bg-pink-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s.icon} {s.label}
              </button>
            ))}
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
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Meta de Venda por loja</h2>
                    <p className="text-sm text-gray-500 mt-1">Quanto cada loja deve vender em cada dia da semana — o padrão que a equipe é cobrada em cima.</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-medium text-gray-700">
                      Meta total do mês: <span className="font-bold text-gray-900">{metaMensalDraft != null ? formatBRL(metaMensalDraft) : '—'}</span>
                    </p>
                    {diasSemMeta > 0 && <p className="text-xs text-amber-600 mt-1">{diasSemMeta} dia(s) da semana sem meta cadastrada</p>}
                  </div>
                  <OrcamentoGradeSemanal lojas={LOJAS} valores={metaVenda} onChange={mudarMeta} readOnly={bloqueado} />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Entradas de Caixa</h2>
                    <p className="text-sm text-gray-500 mt-1">Saldo inicial do mês e previsão de entrada em caixa por dia da semana — usada pros dias futuros do calendário.</p>
                  </div>
                  <div className="bg-white rounded-xl border border-gray-100 p-4 grid grid-cols-2 gap-3">
                    {LOJAS.map((loja) => (
                      <div key={loja.id}>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Saldo inicial — {loja.label}</label>
                        {bloqueado ? (
                          <p className="text-sm text-gray-800">{saldoInicial[loja.id] ? formatBRL(Number(saldoInicial[loja.id])) : '—'}</p>
                        ) : (
                          <input
                            type="number" step="0.01" value={saldoInicial[loja.id]}
                            onChange={(e) => setSaldoInicial((prev) => ({ ...prev, [loja.id]: e.target.value }))}
                            placeholder="Opcional" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {diasSemEntrada > 0 && (
                    <p className="text-xs text-amber-600">{diasSemEntrada} dia(s) da semana sem previsão cadastrada — vão aparecer como "—" no calendário.</p>
                  )}
                  <OrcamentoGradeSemanal lojas={LOJAS} valores={entradaPrevista} onChange={mudarEntrada} readOnly={bloqueado} />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Despesas Fixas</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        O que já está lançado com vencimento futuro, mais o que as recorrências ativas vão gerar. Se é previsível, lance como despesa de verdade — não tem campo de previsão manual aqui.
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

                  {recorrencias.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2">Recorrências ativas ({formatBRL(recorrencias.reduce((s, r) => s + r.valor, 0))})</p>
                      <div className="space-y-1">
                        {recorrencias.map((r, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg text-xs text-purple-800">
                            <span>{r.nome} (dia {r.diaVencimento})</span>
                            <span className="font-semibold">{formatBRL(r.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Já lançadas, vencimento futuro — {formatBRL(despesasFixas?.total || 0)}</p>
                    {despesasFixas && despesasFixas.itens.length > 0 ? (
                      <div className="space-y-1">
                        {despesasFixas.itens.map((item, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                            <span className="text-gray-700">
                              {item.parteNome} — {item.contaNome}
                              <span className="ml-1.5 text-[10px] text-gray-400">{new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                            </span>
                            <span className="font-semibold text-gray-800">{formatBRL(item.valor)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Nenhuma despesa fixa futura lançada ainda.</p>
                    )}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Despesas Variáveis</h2>
                    <p className="text-sm text-gray-500 mt-1">Insumos, embalagens, despesas diversas — por fornecedor ou por conta (ex: pró-labore, distribuição de lucro).</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Com dia da semana ou data marcada, a previsão também aparece nos dias futuros do calendário do Fluxo de Caixa — e some sozinha quando o dia passa ou quando a despesa real for lançada.
                    </p>
                  </div>
                  <OrcamentoItensVariaveis itens={itensVariaveis} onChange={setItensVariaveis} fornecedores={fornecedores} contas={contas} dias={dias} readOnly={bloqueado} />
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Revisão — como o mês vai terminar</h2>
                    <p className="text-sm text-gray-500 mt-1">Prévia ao vivo, combinando o que já é real com o que você acabou de cadastrar.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Meta de Venda</p>
                      <p className="text-lg font-bold text-gray-800 mt-1">{metaMensalDraft != null ? formatBRL(metaMensalDraft) : '—'}</p>
                      {diasSemMeta > 0 && <p className="text-[10px] text-amber-600 mt-0.5">{diasSemMeta} dia(s) sem meta</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">GAP Acumulado (fim do mês)</p>
                      <p className={`text-lg font-bold mt-1 ${gapFinal == null ? 'text-gray-400' : gapFinal >= 0 ? 'text-green-600' : 'text-amber-600'}`}>
                        {gapFinal != null ? formatBRL(gapFinal) : '—'}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Entradas de Caixa (mês todo)</p>
                      <p className="text-lg font-bold text-green-600 mt-1">{formatBRL(totalEntradasDraft)}</p>
                      {diasSemEntrada > 0 && <p className="text-[10px] text-amber-600 mt-0.5">{diasSemEntrada} dia(s) sem previsão</p>}
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4">
                      <p className="text-xs text-gray-500 uppercase font-semibold">Saldo Projetado do Mês</p>
                      <p className={`text-lg font-bold mt-1 ${saldoProjetado == null ? 'text-gray-400' : saldoProjetado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {saldoProjetado != null ? formatBRL(saldoProjetado) : 'Incompleto'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Despesas Fixas conhecidas — {formatBRL(despesasFixas?.total || 0)}</p>
                    <p className="text-xs text-gray-400">Já lançadas ou geradas por recorrência — sem orçado x realizado nessa categoria, porque não existe mais previsão manual aqui.</p>
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
                    </div>
                  )}

                  {bloqueado ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 text-center">
                      Mês encerrado — orçamento é somente leitura.
                    </div>
                  ) : (
                    <button
                      onClick={salvar}
                      disabled={salvando}
                      className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {salvando ? 'Salvando...' : (<><Check size={18} /> Salvar Orçamento</>)}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
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
