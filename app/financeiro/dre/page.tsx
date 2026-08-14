'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import DreDetalheModal from '@/components/DreDetalheModal'
import PageHeader from '@/components/PageHeader'
import { buscarDre, DreResultado, VisaoDre, DreSecao, DreContaValor } from '@/lib/financeiro-dre'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { ChevronLeft, ChevronRight, Loader, AlertCircle } from 'lucide-react'
import { CategoriaReceita } from '@/lib/types'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const VISAO_LABEL: Record<VisaoDre, string> = {
  loja1: UNIDADE_LABEL.loja1,
  loja2: UNIDADE_LABEL.loja2,
  consolidado: 'Consolidado',
}

type ModalDetalhe =
  | { tipo: 'receita'; titulo: string; categoria: CategoriaReceita }
  | { tipo: 'insumo' | 'despesa'; titulo: string; contaId: string }
  | { tipo: 'aporte'; titulo: string }

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
  notaExtra,
}: {
  titulo: string
  secao: DreSecao
  onAbrirConta: (c: DreContaValor) => void
  notaExtra?: React.ReactNode
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
            const clicavel = !c.contaId.startsWith('sintetico-') && c.valor !== 0
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
      {notaExtra && <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">{notaExtra}</div>}
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

export default function DrePage() {
  const hoje = new Date()

  const [unidade, setUnidade] = useState<VisaoDre>('loja1')
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth() + 1)

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [dados, setDados] = useState<DreResultado | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<ModalDetalhe | null>(null)

  useEffect(() => {
    carregar()
  }, [unidade, ano, mes])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const resultado = await buscarDre(unidade, ano, mes)
      setDados(resultado)
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

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="DRE" backHref="/financeiro" maxWidth="max-w-3xl" />

        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-4">
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

          <div className="flex items-center justify-center gap-4 mb-6">
            <button onClick={mesAnterior} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronLeft size={20} className="text-gray-600" />
            </button>
            <p className="text-lg font-semibold text-gray-800 min-w-[180px] text-center">{MESES[mes - 1]} de {ano}</p>
            <button onClick={proximoMes} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
              <ChevronRight size={20} className="text-gray-600" />
            </button>
          </div>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} className="animate-spin" /> Carregando...
            </div>
          ) : dados ? (
            <>
              <div className="bg-white rounded-xl p-4 border border-gray-100 mb-4">
                <p className="text-xs text-gray-500 uppercase font-semibold">Resultado Líquido do Período</p>
                <p className={`text-2xl font-bold mt-1 ${dados.resultado >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatBRL(dados.resultado)}
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex items-start gap-2 text-xs text-blue-800">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  "CMV" é o valor das notas de compra no mês de competência — não é CMV real (não desconta estoque nem
                  considera o que foi de fato consumido/vendido).
                </span>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-amber-800">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Competência de lançamentos antigos (antes desta funcionalidade) é aproximada pela data de
                  lançamento/pagamento — só despesas recorrentes configuradas depois têm competência deslocada de verdade.
                  {unidade !== 'consolidado' && dados.percentualRateio != null && (
                    <> Rateio aplicado: {(dados.percentualRateio * 100).toFixed(1)}% das despesas de rateio/cozinha do mês, proporcional ao faturamento — se uma loja lançar menos vendas em dinheiro que a outra, essa proporção fica distorcida.</>
                  )}
                </span>
              </div>

              {dados.secaoNaoClassificada.total !== 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Há {formatBRL(dados.secaoNaoClassificada.total)} em contas sem linha do DRE definida (rode a migration
                    de classificação do plano de contas). Esse valor está incluído no Resultado Líquido do Período, mas
                    fora da cascata abaixo — veja "Não classificado".
                  </span>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-3">
                <p className="text-sm font-semibold text-gray-700 px-4 py-3 border-b border-gray-100">
                  Receita Bruta de Vendas — {formatBRL(dados.totalReceitaBruta)}
                </p>
                <div className="divide-y divide-gray-100">
                  {dados.receitaBrutaPorCategoria.map((c) => (
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

              <SecaoCascata
                titulo="(−) Resultado Financeiro"
                secao={dados.secaoResultadoFinanceiro}
                onAbrirConta={(c) => abrirConta(dados.secaoResultadoFinanceiro, c)}
                notaExtra="Empréstimos/Amortizações refletem o valor lançado nessas contas — se incluírem a parcela de principal (não só juros), o resultado fica subestimado; confira como esses lançamentos são registrados."
              />
              <SubtotalCascata label="= Lucro Líquido Antes da Distribuição" valor={dados.totalLucroLiquidoAntesDistribuicao} />

              <SecaoCascata titulo="(−) Distribuição de Lucros" secao={dados.secaoDistribuicaoLucros} onAbrirConta={(c) => abrirConta(dados.secaoDistribuicaoLucros, c)} />
            </>
          ) : null}
        </div>

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
