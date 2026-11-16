'use client'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import ProtectedRoute from '@/components/ProtectedRoute'
import DreDetalheModal from '@/components/DreDetalheModal'
import DreKpis from '@/components/dre/DreKpis'
import DreCascataTabela from '@/components/dre/DreCascataTabela'
import DreGraficoCascata from '@/components/dre/DreGraficoCascata'
import DrePendencias from '@/components/dre/DrePendencias'
import PageHeader from '@/components/PageHeader'
import { buscarDre, buscarDreComparativo, DreResultado, VisaoDre, DreSecao } from '@/lib/financeiro-dre'
import { buscarQualidadeDre, QualidadeDre } from '@/lib/financeiro-dre-qualidade'
import { ContaCascata, LinhaCascata, montarCascata, passosDoGrafico } from '@/lib/financeiro-dre-apresentacao'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Loader, Info, X } from 'lucide-react'
import { CategoriaReceita } from '@/lib/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const VISAO_LABEL: Record<VisaoDre, string> = {
  loja1: UNIDADE_LABEL.loja1,
  loja2: UNIDADE_LABEL.loja2,
  consolidado: 'Consolidado',
}

type Modo = 'unico' | 'comparativo'

type ModalDetalhe =
  | { tipo: 'receita'; titulo: string; categoria: CategoriaReceita }
  | { tipo: 'insumo' | 'despesa'; titulo: string; contaId: string }
  | { tipo: 'aporte'; titulo: string }

interface Aviso {
  tom: 'azul' | 'ambar' | 'vermelho'
  texto: string
}

const TOM_CLASSES: Record<Aviso['tom'], string> = {
  azul: 'bg-blue-50 border-blue-200 text-blue-800',
  ambar: 'bg-amber-50 border-amber-200 text-amber-800',
  vermelho: 'bg-red-50 border-red-200 text-red-700',
}

function montarAvisos(dados: DreResultado, unidade: VisaoDre): Aviso[] {
  const avisos: Aviso[] = [
    {
      tom: 'azul',
      texto:
        '"CMV" é o valor das notas de compra no mês de competência — não é CMV real (não desconta estoque nem considera o que foi de fato consumido/vendido).',
    },
    {
      tom: 'azul',
      texto:
        'Juros, multa e taxa por atraso registrados na conciliação do extrato aparecem em Despesas Financeiras (3005), no mês do PAGAMENTO — tanto os de despesas quanto os de notas de insumos. A conta original da despesa fica só com o valor sem o juros.',
    },
    {
      tom: 'ambar',
      texto:
        'Competência de lançamentos antigos (antes desta funcionalidade) é aproximada pela data de lançamento/pagamento — só despesas recorrentes configuradas depois têm competência deslocada de verdade.' +
        (unidade !== 'consolidado' && dados.percentualRateio != null
          ? ` Rateio aplicado: ${(dados.percentualRateio * 100).toFixed(1)}% das despesas e do CMV de rateio/cozinha do mês, proporcional ao faturamento fiscal de cada loja (Import do PDV).`
          : ''),
    },
    {
      tom: 'ambar',
      texto:
        'Empréstimos/Amortizações (Resultado Financeiro) refletem o valor lançado nessas contas — se incluírem a parcela de principal (não só juros), o resultado fica subestimado; confira como esses lançamentos são registrados.',
    },
  ]
  if (dados.secaoNaoClassificada.total !== 0) {
    avisos.unshift({
      tom: 'vermelho',
      texto: `Há ${formatBRL(dados.secaoNaoClassificada.total)} em contas sem linha do DRE definida (rode a migration de classificação do plano de contas). Esse valor está incluído no Resultado Líquido do Período, mas fora da cascata abaixo — veja "Não classificado".`,
    })
  }
  return avisos
}

function AvisosModal({ avisos, onClose }: { avisos: Aviso[]; onClose: () => void }) {
  useEscapeKey(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Avisos sobre este DRE">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Avisos sobre este DRE</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        <div className="space-y-3">
          {avisos.map((a, i) => (
            <div key={i} className={`rounded-lg p-3 text-xs border ${TOM_CLASSES[a.tom]}`}>
              {a.texto}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full bg-gray-100 text-gray-700 rounded-lg py-2.5 text-sm font-medium mt-4">
          Fechar
        </button>
      </div>
    </div>
  )
}

// CMV é a única seção cujas contas vêm de itens de compra (fornecedor);
// todo o resto vem de lançamentos de despesa (beneficiário) — decide qual
// rótulo o painel de detalhe usa, sem precisar guardar isso por conta.
function tipoOrigem(linha: DreSecao['linha']): 'insumo' | 'despesa' {
  return linha === 'cmv' ? 'insumo' : 'despesa'
}

interface LinhaComparativa {
  label: string
  valores: number[]
  subtotal?: boolean
}

function TabelaComparativa({ dados: dadosCronologicos }: { dados: DreResultado[] }) {
  // Mês mais recente PRIMEIRO: a primeira coluna visível é a que importa (antes era a mais antiga,
  // geralmente vazia).
  const dados = [...dadosCronologicos].reverse()
  const linhas: LinhaComparativa[] = [
    { label: 'Receita Bruta de Vendas', valores: dados.map((d) => d.totalReceitaBruta) },
    { label: '(−) Deduções de Vendas', valores: dados.map((d) => d.secaoDeducaoVendas.total) },
    { label: '= Receita Líquida de Vendas', valores: dados.map((d) => d.totalReceitaLiquida), subtotal: true },
    { label: '(−) CMV (compras de insumos)', valores: dados.map((d) => d.secaoCmv.total) },
    { label: '(−) Mão de Obra e Encargos', valores: dados.map((d) => d.secaoMaoObra.total) },
    { label: '= Lucro Bruto', valores: dados.map((d) => d.totalLucroBruto), subtotal: true },
    { label: '(−) Despesas Operacionais', valores: dados.map((d) => d.secaoDespesasOperacionais.total) },
    { label: '= Resultado Operacional', valores: dados.map((d) => d.totalResultadoOperacional), subtotal: true },
    { label: '(−) Resultado Financeiro', valores: dados.map((d) => d.secaoResultadoFinanceiro.total) },
    { label: '= Lucro Líquido Antes da Distribuição', valores: dados.map((d) => d.totalLucroLiquidoAntesDistribuicao), subtotal: true },
    { label: '(−) Distribuição de Lucros', valores: dados.map((d) => d.secaoDistribuicaoLucros.total) },
    { label: '= Resultado Líquido do Período', valores: dados.map((d) => d.resultado), subtotal: true },
  ]

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 z-10 bg-white whitespace-nowrap">
                Linha
              </th>
              {dados.map((d) => (
                <th key={`${d.ano}-${d.mes}`} className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">
                  {MESES_ABREV[d.mes - 1]}/{String(d.ano).slice(2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.label} className={l.subtotal ? 'bg-pink-50/60' : ''}>
                <td
                  className={`px-4 py-2.5 sticky left-0 z-10 whitespace-nowrap ${
                    l.subtotal ? 'bg-pink-50 font-bold text-pink-900' : 'bg-white text-gray-600'
                  }`}
                >
                  {l.label}
                </td>
                {l.valores.map((v, i) => (
                  <td
                    key={i}
                    className={`px-4 py-2.5 text-right whitespace-nowrap tabular-nums ${
                      !dados[i].temDados
                        ? 'text-gray-300'
                        : l.subtotal
                          ? 'font-bold text-pink-900'
                          : v < 0
                            ? 'text-red-600'
                            : 'text-gray-800'
                    }`}
                    title={!dados[i].temDados ? 'Mês sem receita nem lançamentos' : undefined}
                  >
                    {dados[i].temDados ? formatBRL(v) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Selos do mês (na barra de contexto): parcial / dados incompletos / sem alertas.
function SelosDoMes({
  modo,
  qualidade,
  ehMesCorrente,
  hoje,
  ano,
  mes,
}: {
  modo: Modo
  qualidade: QualidadeDre | null
  ehMesCorrente: boolean
  hoje: Date
  ano: number
  mes: number
}) {
  const emAndamento = modo === 'unico' ? qualidade?.mesEmAndamento : null
  const andamento = emAndamento ?? (ehMesCorrente ? { dia: hoje.getDate(), total: new Date(ano, mes, 0).getDate(), futuro: false } : null)
  const alertas = qualidade ? qualidade.itens.filter((i) => i.nivel === 'alerta').length : 0
  return (
    <div className="flex flex-wrap items-center gap-2 min-h-[28px]" aria-live="polite">
      {andamento && (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          {andamento.futuro ? 'Mês futuro' : `Mês em andamento · dia ${andamento.dia} de ${andamento.total}`}
        </span>
      )}
      {modo === 'unico' && qualidade && !qualidade.completo && (
        <button
          onClick={() => document.getElementById('dre-pendencias')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200"
          title="Ver as pendências deste mês"
        >
          Dados incompletos · {alertas} alerta(s)
        </button>
      )}
      {modo === 'unico' && qualidade && qualidade.completo && !andamento && (
        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">Sem alertas de dados</span>
      )}
    </div>
  )
}

// Visão, mês e modo vivem na URL (?v=&ano=&mes=&m=): recarregar a página, voltar e compartilhar o link mantêm
// exatamente o que se estava vendo. Sem parâmetros, abre no ÚLTIMO MÊS COMPLETO (o mês corrente é parcial e
// parecia final) e no Consolidado.
function DreConteudo() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hoje = new Date()
  const ultimoMesCompleto = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const visaoParam = searchParams.get('v')
  const unidade: VisaoDre = visaoParam === 'loja1' || visaoParam === 'loja2' || visaoParam === 'consolidado' ? visaoParam : 'consolidado'
  const mesParam = Number(searchParams.get('mes'))
  const ano = Number(searchParams.get('ano')) || ultimoMesCompleto.getFullYear()
  const mes = mesParam >= 1 && mesParam <= 12 ? mesParam : ultimoMesCompleto.getMonth() + 1
  const modo: Modo = searchParams.get('m') === 'comp' ? 'comparativo' : 'unico'

  const atualizar = useCallback(
    (parcial: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString())
      // grava sempre ano e mes juntos: o link fica explícito mesmo quando é o mês padrão
      if (!p.get('ano')) p.set('ano', String(ano))
      if (!p.get('mes')) p.set('mes', String(mes))
      Object.entries(parcial).forEach(([k, v]) => {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      })
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [searchParams, pathname, router, ano, mes]
  )

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DreResultado | null>(null)
  // undefined = carregando o mês anterior; null = não deu para carregar
  const [dadosAnterior, setDadosAnterior] = useState<DreResultado | null | undefined>(undefined)
  const [dadosComparativo, setDadosComparativo] = useState<DreResultado[] | null>(null)
  const [qualidade, setQualidade] = useState<QualidadeDre | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<ModalDetalhe | null>(null)
  const [mostrarAvisos, setMostrarAvisos] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const requisicao = useRef(0)

  const anoAnterior = mes === 1 ? ano - 1 : ano
  const mesAnteriorNum = mes === 1 ? 12 : mes - 1

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidade, ano, mes, modo])

  async function carregar() {
    const id = ++requisicao.current
    setLoading(true)
    setErro('')
    setQualidade(null)
    setDadosAnterior(undefined)
    try {
      if (modo === 'unico') {
        const dre = await buscarDre(unidade, ano, mes)
        if (id !== requisicao.current) return
        setDados(dre)
        setLoading(false)
        // o DRE aparece primeiro; os sinais de qualidade e o mês anterior chegam logo depois, sem segurar a tela
        buscarQualidadeDre(unidade, ano, mes, dre)
          .then((q) => id === requisicao.current && setQualidade(q))
          .catch((e) => console.error('Erro ao calcular a qualidade do DRE:', e))
        buscarDre(unidade, anoAnterior, mesAnteriorNum)
          .then((a) => id === requisicao.current && setDadosAnterior(a))
          .catch((e) => {
            console.error('Erro ao carregar o mês anterior do DRE:', e)
            if (id === requisicao.current) setDadosAnterior(null)
          })
      } else {
        const comparativo = await buscarDreComparativo(unidade, ano, mes, 6)
        if (id !== requisicao.current) return
        setDadosComparativo(comparativo)
      }
    } catch (err: any) {
      if (id !== requisicao.current) return
      console.error('Erro ao carregar DRE:', err)
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      if (id === requisicao.current) setLoading(false)
    }
  }

  function mesAnterior() {
    if (mes === 1) atualizar({ mes: '12', ano: String(ano - 1) })
    else atualizar({ mes: String(mes - 1), ano: String(ano) })
  }
  function proximoMes() {
    if (mes === 12) atualizar({ mes: '1', ano: String(ano + 1) })
    else atualizar({ mes: String(mes + 1), ano: String(ano) })
  }

  // ← e → trocam de mês (a menos que a pessoa esteja digitando ou com um painel aberto)
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const alvo = e.target as HTMLElement | null
      if (alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable)) return
      if (modalDetalhe || mostrarAvisos) return
      if (e.key === 'ArrowLeft') mesAnterior()
      else proximoMes()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atualizar, mes, ano, modalDetalhe, mostrarAvisos])

  function abrirConta(linha: LinhaCascata, c: ContaCascata) {
    if (!linha.secao) return
    setModalDetalhe({
      tipo: tipoOrigem(linha.secao.linha),
      titulo: c.codigo !== '—' ? `${c.codigo} — ${c.nome}` : c.nome,
      contaId: c.contaId,
    })
  }

  const linhasCascata = useMemo(() => (dados ? montarCascata(dados, dadosAnterior ?? null) : []), [dados, dadosAnterior])
  const passosGrafico = useMemo(() => (dados ? passosDoGrafico(dados) : []), [dados])
  const idsComContas = useMemo(() => linhasCascata.filter((l) => l.tipo === 'grupo' && l.contas.length > 0).map((l) => l.id), [linhasCascata])
  const todosAbertos = idsComContas.length > 0 && idsComContas.every((id) => expandidos.has(id))

  function alternar(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }
  function alternarTodos() {
    setExpandidos(todosAbertos ? new Set() : new Set(idsComContas))
  }

  const avisos = dados ? montarAvisos(dados, unidade) : []
  const temAvisoUrgente = !!dados && dados.secaoNaoClassificada.total !== 0
  const ehMesCorrente = ano === hoje.getFullYear() && mes === hoje.getMonth() + 1
  const parcial = modo === 'unico' && (!!qualidade?.mesEmAndamento || ehMesCorrente)

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="DRE"
          backHref="/financeiro"
          maxWidth="max-w-[1600px]"
          actions={
            modo === 'unico' && dados ? (
              <button
                onClick={() => setMostrarAvisos(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                title="Avisos sobre este DRE"
                aria-label="Avisos sobre este DRE"
              >
                <Info size={20} />
                {temAvisoUrgente && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              </button>
            ) : undefined
          }
        />

        {/* barra de contexto: fica fixa no topo ao rolar */}
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200">
          <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="Visão">
              {(['loja1', 'loja2', 'consolidado'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => atualizar({ v: u })}
                  aria-pressed={unidade === u}
                  className={`px-3.5 py-1.5 text-sm font-semibold ${
                    unidade === u ? 'bg-pink-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {VISAO_LABEL[u]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button onClick={mesAnterior} aria-label="Mês anterior" title="Mês anterior (←)" className="p-1.5 hover:bg-gray-100 rounded-lg">
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
              <p className="text-base font-semibold text-gray-800 min-w-[170px] text-center">
                {modo === 'unico' ? `${MESES[mes - 1]} de ${ano}` : `Até ${MESES[mes - 1]} de ${ano}`}
              </p>
              <button onClick={proximoMes} aria-label="Próximo mês" title="Próximo mês (→)" className="p-1.5 hover:bg-gray-100 rounded-lg">
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="Modo">
              {(['unico', 'comparativo'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => atualizar({ m: m === 'comparativo' ? 'comp' : null })}
                  aria-pressed={modo === m}
                  className={`px-3 py-1.5 text-sm font-medium ${modo === m ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {m === 'unico' ? 'Mês único' : 'Comparativo (6 meses)'}
                </button>
              ))}
            </div>

            <SelosDoMes modo={modo} qualidade={qualidade} ehMesCorrente={ehMesCorrente} hoje={hoje} ano={ano} mes={mes} />
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 py-5 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : modo === 'comparativo' ? (
            dadosComparativo && <TabelaComparativa dados={dadosComparativo} />
          ) : dados ? (
            <>
              <DreKpis dados={dados} anterior={dadosAnterior} parcial={parcial} mesAnterior={mesAnteriorNum} />

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4 items-start">
                <DreCascataTabela
                  linhas={linhasCascata}
                  receitaLiquida={dados.totalReceitaLiquida}
                  receitaBruta={dados.totalReceitaBruta}
                  rotuloAnterior={MESES_ABREV[mesAnteriorNum - 1].toLowerCase()}
                  carregandoAnterior={dadosAnterior === undefined}
                  parcial={parcial}
                  expandidos={expandidos}
                  onAlternar={alternar}
                  onAlternarTodos={alternarTodos}
                  todosAbertos={todosAbertos}
                  onAbrirConta={abrirConta}
                />

                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-700 mb-2">Da receita bruta ao resultado</p>
                    <DreGraficoCascata passos={passosGrafico} />
                  </div>
                  <DrePendencias qualidade={qualidade} />
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Caixa × competência</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    O resultado acima é por competência. Aqui fica o que efetivamente caiu no banco e o que foi e voltou da reserva — informativo, não entra no resultado.
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-gray-100">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 px-4 pt-3">
                      Entradas de caixa — <span className="tabular-nums">{formatBRL(dados.totalEntradasCaixa)}</span>
                    </p>
                    <div className="divide-y divide-gray-100">
                      {dados.entradasCaixaPorCategoria.map((c) => (
                        <button
                          key={c.categoria}
                          onClick={() => setModalDetalhe({ tipo: 'receita', titulo: c.label, categoria: c.categoria })}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                        >
                          <span className="text-gray-600">{c.label}</span>
                          <span className={`tabular-nums ${c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{formatBRL(c.valor)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 px-4 pt-3">Reserva (13º, férias, ativo fixo…)</p>
                    {dados.totalAportesReserva > 0 || dados.totalResgatesAplicacao > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {dados.totalAportesReserva > 0 && (
                          <button
                            onClick={() => setModalDetalhe({ tipo: 'aporte', titulo: 'Aportes em Reserva' })}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                          >
                            <span className="text-gray-600">
                              Aportes em reserva
                              <span className="block text-xs text-gray-400">Caixa saindo para a reserva — não é despesa.</span>
                            </span>
                            <span className="font-semibold text-gray-800 tabular-nums">{formatBRL(dados.totalAportesReserva)}</span>
                          </button>
                        )}
                        {dados.totalResgatesAplicacao > 0 && (
                          <button
                            onClick={() => setModalDetalhe({ tipo: 'receita', titulo: 'Resgate de Aplicação', categoria: 'resgate_aplicacao' })}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                          >
                            <span className="text-gray-600">
                              Resgates de aplicação
                              <span className="block text-xs text-gray-400">Volta da reserva para o caixa — não é venda.</span>
                            </span>
                            <span className="font-semibold text-gray-800 tabular-nums">{formatBRL(dados.totalResgatesAplicacao)}</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 px-4 py-4">Sem aportes nem resgates neste mês.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {mostrarAvisos && <AvisosModal avisos={avisos} onClose={() => setMostrarAvisos(false)} />}

        {modalDetalhe && dados && (
          <DreDetalheModal
            tipo={modalDetalhe.tipo === 'aporte' ? 'despesa' : modalDetalhe.tipo}
            titulo={modalDetalhe.titulo}
            receitas={
              modalDetalhe.tipo === 'receita'
                ? dados.receitasDetalhadas.filter((r) => r.categoria === modalDetalhe.categoria)
                : undefined
            }
            linhas={
              modalDetalhe.tipo === 'insumo' || modalDetalhe.tipo === 'despesa'
                ? dados.linhasDetalhadas.filter((l) => l.contaId === modalDetalhe.contaId)
                : modalDetalhe.tipo === 'aporte'
                  ? dados.aportesReservaDetalhados
                  : undefined
            }
            onClose={() => setModalDetalhe(null)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}

// useSearchParams exige <Suspense> no App Router.
export default function DrePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>}>
      <DreConteudo />
    </Suspense>
  )
}
