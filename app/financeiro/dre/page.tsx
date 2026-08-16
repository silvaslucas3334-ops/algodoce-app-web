'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import DreDetalheModal from '@/components/DreDetalheModal'
import PageHeader from '@/components/PageHeader'
import { buscarDre, buscarDreComparativo, DreResultado, VisaoDre, DreSecao, DreContaValor } from '@/lib/financeiro-dre'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Loader, Info, X, TrendingUp, TrendingDown } from 'lucide-react'
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
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Avisos sobre este DRE</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
// rótulo o modal de detalhe usa, sem precisar guardar isso por conta.
function tipoOrigem(linha: DreSecao['linha']): 'insumo' | 'despesa' {
  return linha === 'cmv' ? 'insumo' : 'despesa'
}

function SecaoCascata({
  titulo,
  secao,
  onAbrirConta,
}: {
  titulo: string
  secao: DreSecao
  onAbrirConta: (c: DreContaValor) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-700">
          {titulo} — {formatBRL(secao.total)}
        </p>
        {secao.percentual != null && (
          <span className="text-xs text-gray-400 whitespace-nowrap">{secao.percentual.toFixed(1)}%</span>
        )}
      </div>
      {secao.contas.length === 0 ? (
        <p className="text-sm text-gray-400 px-4 py-4">Nenhuma conta classificada nesta linha.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {secao.contas.map((c) => {
            const clicavel = c.valor !== 0
            const conteudo = (
              <>
                <span className="text-gray-600">
                  {c.codigo !== '—' ? `${c.codigo} — ${c.nome}` : c.nome}
                  {c.notaZerado && <span className="block text-xs text-amber-600 mt-0.5">{c.notaZerado}</span>}
                </span>
                <span className={c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}>{formatBRL(c.valor)}</span>
              </>
            )
            return clicavel ? (
              <button
                key={c.contaId}
                onClick={() => onAbrirConta(c)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
              >
                {conteudo}
              </button>
            ) : (
              <div key={c.contaId} className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left">
                {conteudo}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SubtotalCascata({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="bg-pink-50 border border-pink-200 rounded-lg px-4 py-2.5 flex items-center justify-between mb-3">
      <p className="text-sm font-bold text-pink-900">{label}</p>
      <p className="text-sm font-bold text-pink-900">{formatBRL(valor)}</p>
    </div>
  )
}

interface LinhaComparativa {
  label: string
  valores: number[]
  subtotal?: boolean
}

function TabelaComparativa({ dados }: { dados: DreResultado[] }) {
  const linhas: LinhaComparativa[] = [
    { label: 'Receita Bruta de Vendas', valores: dados.map((d) => d.totalReceitaBruta) },
    { label: '(−) Deduções de Vendas', valores: dados.map((d) => d.secaoDeducaoVendas.total) },
    { label: '= Receita Líquida de Vendas', valores: dados.map((d) => d.totalReceitaLiquida), subtotal: true },
    { label: '(−) CMV', valores: dados.map((d) => d.secaoCmv.total) },
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
                    className={`px-4 py-2.5 text-right whitespace-nowrap ${
                      l.subtotal ? 'font-bold text-pink-900' : v < 0 ? 'text-red-600' : 'text-gray-800'
                    }`}
                  >
                    {formatBRL(v)}
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

export default function DrePage() {
  const hoje = new Date()

  const [unidade, setUnidade] = useState<VisaoDre>('loja1')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [modo, setModo] = useState<Modo>('unico')

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DreResultado | null>(null)
  const [dadosComparativo, setDadosComparativo] = useState<DreResultado[] | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<ModalDetalhe | null>(null)
  const [mostrarAvisos, setMostrarAvisos] = useState(false)

  useEffect(() => {
    carregar()
  }, [unidade, ano, mes, modo])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      if (modo === 'unico') {
        setDados(await buscarDre(unidade, ano, mes))
      } else {
        setDadosComparativo(await buscarDreComparativo(unidade, ano, mes, 6))
      }
    } catch (err: any) {
      console.error('Erro ao carregar DRE:', err)
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

  function abrirConta(secao: DreSecao, c: DreContaValor) {
    setModalDetalhe({ tipo: tipoOrigem(secao.linha), titulo: c.codigo !== '—' ? `${c.codigo} — ${c.nome}` : c.nome, contaId: c.contaId })
  }

  const avisos = dados ? montarAvisos(dados, unidade) : []
  const temAvisoUrgente = !!dados && dados.secaoNaoClassificada.total !== 0

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="DRE"
          backHref="/financeiro"
          maxWidth="max-w-3xl"
          actions={
            modo === 'unico' && dados ? (
              <button
                onClick={() => setMostrarAvisos(true)}
                className="relative p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                title="Avisos sobre este DRE"
              >
                <Info size={20} />
                {temAvisoUrgente && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              </button>
            ) : undefined
          }
        />

        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-3">
            {(['loja1', 'loja2', 'consolidado'] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnidade(u)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 ${
                  unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                {VISAO_LABEL[u]}
              </button>
            ))}
          </div>

          <div className="flex gap-2 mb-4">
            {(['unico', 'comparativo'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  modo === m ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {m === 'unico' ? 'Mês único' : 'Comparativo (6 meses)'}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">
              {modo === 'unico' ? `${MESES[mes - 1]} de ${ano}` : `Até ${MESES[mes - 1]} de ${ano}`}
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
          ) : modo === 'comparativo' ? (
            dadosComparativo && <TabelaComparativa dados={dadosComparativo} />
          ) : dados ? (
            <>
              <div className={`rounded-2xl p-6 mb-4 border ${dados.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resultado Líquido do Período</p>
                    <p className={`text-3xl font-bold mt-1 ${dados.resultado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatBRL(dados.resultado)}
                    </p>
                    {dados.totalReceitaBruta > 0 && (
                      <p className={`text-xs font-medium mt-1 ${dados.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {((dados.resultado / dados.totalReceitaBruta) * 100).toFixed(1)}% da Receita Bruta
                      </p>
                    )}
                  </div>
                  <div className={`rounded-full p-3 flex-shrink-0 ${dados.resultado >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {dados.resultado >= 0 ? <TrendingUp size={28} /> : <TrendingDown size={28} />}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3">
                  Receita Bruta de Vendas — {formatBRL(dados.totalReceitaBruta)}
                </p>
                <p className="text-xs text-gray-400 px-4 pb-3">
                  Faturamento fiscal (Import do PDV + faturamento do dia informado manualmente), não mais o que caiu no
                  banco — veja "Entradas de Caixa" mais abaixo pra essa outra visão.
                </p>
              </div>

              {(dados.totalResgatesAplicacao > 0 || dados.totalAportesReserva > 0) && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3 divide-y divide-gray-100">
                  {dados.totalAportesReserva > 0 && (
                    <button
                      onClick={() => setModalDetalhe({ tipo: 'aporte', titulo: 'Aportes em Reserva' })}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Aportes em Reserva</p>
                        <p className="text-xs text-gray-400 mt-0.5">Caixa saindo pra reserva (13º, férias, ativo fixo...) — não é despesa, não entra no resultado.</p>
                      </div>
                      <span className="font-semibold text-gray-800 flex-shrink-0 ml-3">{formatBRL(dados.totalAportesReserva)}</span>
                    </button>
                  )}
                  {dados.totalResgatesAplicacao > 0 && (
                    <button
                      onClick={() => setModalDetalhe({ tipo: 'receita', titulo: 'Resgate de Aplicação', categoria: 'resgate_aplicacao' })}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Resgates de Aplicação</p>
                        <p className="text-xs text-gray-400 mt-0.5">Volta da reserva pro caixa — não é venda, não entra no resultado do mês.</p>
                      </div>
                      <span className="font-semibold text-gray-800 flex-shrink-0 ml-3">{formatBRL(dados.totalResgatesAplicacao)}</span>
                    </button>
                  )}
                </div>
              )}

              <SecaoCascata titulo="(−) Deduções de Vendas" secao={dados.secaoDeducaoVendas} onAbrirConta={(c) => abrirConta(dados.secaoDeducaoVendas, c)} />
              <SubtotalCascata label="= Receita Líquida de Vendas" valor={dados.totalReceitaLiquida} />

              <SecaoCascata titulo="(−) CMV" secao={dados.secaoCmv} onAbrirConta={(c) => abrirConta(dados.secaoCmv, c)} />
              <SecaoCascata titulo="(−) Mão de Obra e Encargos" secao={dados.secaoMaoObra} onAbrirConta={(c) => abrirConta(dados.secaoMaoObra, c)} />
              <SubtotalCascata label="= Lucro Bruto" valor={dados.totalLucroBruto} />

              <SecaoCascata titulo="(−) Despesas Operacionais" secao={dados.secaoDespesasOperacionais} onAbrirConta={(c) => abrirConta(dados.secaoDespesasOperacionais, c)} />
              {dados.secaoNaoClassificada.total !== 0 && (
                <SecaoCascata
                  titulo="Não classificado (revisar plano de contas)"
                  secao={dados.secaoNaoClassificada}
                  onAbrirConta={(c) => abrirConta(dados.secaoNaoClassificada, c)}
                />
              )}
              <SubtotalCascata label="= Resultado Operacional" valor={dados.totalResultadoOperacional} />

              <SecaoCascata titulo="(−) Resultado Financeiro" secao={dados.secaoResultadoFinanceiro} onAbrirConta={(c) => abrirConta(dados.secaoResultadoFinanceiro, c)} />
              <SubtotalCascata label="= Lucro Líquido Antes da Distribuição" valor={dados.totalLucroLiquidoAntesDistribuicao} />

              <SecaoCascata titulo="(−) Distribuição de Lucros" secao={dados.secaoDistribuicaoLucros} onAbrirConta={(c) => abrirConta(dados.secaoDistribuicaoLucros, c)} />

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-6">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Entradas de Caixa (informativo) — {formatBRL(dados.totalEntradasCaixa)}
                </p>
                <p className="text-xs text-gray-400 px-4 pt-3">
                  O que efetivamente caiu no banco no período, por categoria — não entra mais no cálculo do resultado
                  (a Receita Bruta acima já é fiscal). Fica aqui pra conferir a diferença entre o que foi vendido e o
                  que já foi recebido.
                </p>
                <div className="divide-y divide-gray-100">
                  {dados.entradasCaixaPorCategoria.map((c) => (
                    <button
                      key={c.categoria}
                      onClick={() => setModalDetalhe({ tipo: 'receita', titulo: c.label, categoria: c.categoria })}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 text-left"
                    >
                      <span className="text-gray-600">{c.label}</span>
                      <span className={c.valor > 0 ? 'font-semibold text-gray-800' : 'text-gray-400'}>{formatBRL(c.valor)}</span>
                    </button>
                  ))}
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
