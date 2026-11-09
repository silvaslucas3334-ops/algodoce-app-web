'use client'
import { useState } from 'react'
import { CalendarClock, CalendarDays, CheckCircle, Loader, Tag, X } from 'lucide-react'
import { EtiquetaAprovacao, FinanceiroLancamento } from '@/lib/types'
import { ETIQUETA_APROVACAO_COLOR, ETIQUETA_APROVACAO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { hojeISO } from '@/lib/financeiro-utils'
import { aplicarLote, AcaoLote, ResultadoLote } from '@/lib/financeiro-despesas-lote'

interface Props {
  selecionadas: FinanceiroLancamento[]
  onLimpar: () => void
  onConcluido: (resultado: ResultadoLote) => void
}

type Modal = 'pagar' | 'vencimento' | 'etiqueta' | 'previsao' | null

const OPCOES_ETIQUETA: (EtiquetaAprovacao | null)[] = ['aprovada_pagamento', 'planejar_pagamento', null]

const temPagamentoParcial = (l: FinanceiroLancamento) => (l.valor_pago_conciliado || 0) > 0
const valorEmAberto = (l: FinanceiroLancamento) => l.valor_total - (l.valor_pago_conciliado || 0)

/**
 * Barra fixa de ações em lote (pagar / alterar vencimento / etiquetar) + janela de confirmação.
 * Só o admin vê (a tela decide). Mostra sempre o total a pagar do que está selecionado.
 */
export default function DespesasAcoesLote({ selecionadas, onLimpar, onConcluido }: Props) {
  const [modal, setModal] = useState<Modal>(null)
  const [dataPagamento, setDataPagamento] = useState(hojeISO())
  const [novoVencimento, setNovoVencimento] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const hoje = hojeISO()
  const aptas = selecionadas.filter((l) => !temPagamentoParcial(l)) // pagar e vencimento pulam parciais
  const parciais = selecionadas.length - aptas.length
  const totalSelecionado = selecionadas.reduce((s, l) => s + valorEmAberto(l), 0)
  const totalAptas = aptas.reduce((s, l) => s + valorEmAberto(l), 0)

  function abrir(m: Modal) {
    setErro('')
    if (m === 'pagar') setDataPagamento(hojeISO())
    if (m === 'previsao') setDataPrevista('')
    setModal(m)
  }

  async function executar(acao: AcaoLote) {
    setProcessando(true)
    setErro('')
    // etiqueta e data prevista valem para todas as selecionadas; pagar e vencimento pulam as parciais
    const vale_para_todas = acao.tipo === 'etiqueta' || acao.tipo === 'prevista'
    const ids = (vale_para_todas ? selecionadas : aptas).map((l) => l.id)
    const resultado = await aplicarLote(ids, acao)
    setProcessando(false)
    if (resultado.erro && resultado.alterados.length === 0) {
      setErro(resultado.erro) // nada foi alterado: deixa a janela aberta para tentar de novo
      return
    }
    // parciais pulados antes de chamar também contam como "não alterados" no aviso
    const puladosDeAntes = vale_para_todas ? [] : selecionadas.filter(temPagamentoParcial).map((l) => l.id)
    setModal(null)
    onConcluido({
      ...resultado,
      pedidos: resultado.pedidos + puladosDeAntes.length,
      ignorados: [...resultado.ignorados, ...puladosDeAntes],
    })
  }

  const confirmarDesabilitado = processando || aptas.length === 0

  return (
    <>
      <div className="fixed left-0 right-0 bottom-16 z-40 px-3 pb-2">
        <div className="max-w-4xl mx-auto bg-gray-900 text-white rounded-xl shadow-xl px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-sm flex items-center gap-2">
            <button onClick={onLimpar} className="p-1 rounded-lg hover:bg-white/15" aria-label="Limpar seleção" title="Limpar seleção">
              <X size={15} />
            </button>
            <span>
              <span className="font-semibold">{selecionadas.length}</span> selecionada{selecionadas.length === 1 ? '' : 's'}
              <span className="text-gray-300"> · {formatBRL(totalSelecionado)}</span>
            </span>
          </div>
          {/* flex-wrap: em tela estreita os botões quebram de linha em vez de passar da borda */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <button
              onClick={() => abrir('pagar')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 font-semibold flex items-center gap-1"
            >
              <CheckCircle size={13} className="hidden sm:block" /> Pagar
            </button>
            <button
              onClick={() => abrir('vencimento')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold flex items-center gap-1"
            >
              <CalendarDays size={13} className="hidden sm:block" /> Vencimento
            </button>
            <button
              onClick={() => abrir('previsao')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold flex items-center gap-1"
              title="Data planejada de pagamento — o Fluxo de Caixa projeta a saída nesse dia"
            >
              <CalendarClock size={13} className="hidden sm:block" /> Previsão
            </button>
            <button
              onClick={() => abrir('etiqueta')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold flex items-center gap-1"
            >
              <Tag size={13} className="hidden sm:block" /> Etiqueta
            </button>
          </div>
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            {modal === 'pagar' && (
              <>
                <h2 className="font-semibold text-gray-800 text-lg">
                  Pagar {aptas.length} {aptas.length === 1 ? 'despesa' : 'despesas'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Total <span className="font-semibold text-gray-800">{formatBRL(totalAptas)}</span>. Marca como paga, sem conciliar com o extrato
                  (igual ao botão Pagar de cada despesa); a conciliação bancária segue normal depois.
                </p>
                <label className="block text-xs font-medium text-gray-500 mt-4 mb-1">Data do pagamento</label>
                <input
                  type="date"
                  value={dataPagamento}
                  max={hoje}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </>
            )}

            {modal === 'vencimento' && (
              <>
                <h2 className="font-semibold text-gray-800 text-lg">
                  Alterar vencimento de {aptas.length} {aptas.length === 1 ? 'despesa' : 'despesas'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">Todas passam a vencer na data abaixo. Cada mudança fica registrada no Histórico da despesa.</p>
                <label className="block text-xs font-medium text-gray-500 mt-4 mb-1">Novo vencimento</label>
                <input
                  type="date"
                  value={novoVencimento}
                  onChange={(e) => setNovoVencimento(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </>
            )}

            {modal === 'previsao' && (
              <>
                <h2 className="font-semibold text-gray-800 text-lg">
                  Pagamento previsto de {selecionadas.length} {selecionadas.length === 1 ? 'despesa' : 'despesas'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Data em que você planeja pagar (diferente do vencimento). O Fluxo de Caixa passa a projetar a saída nesse dia; se a data passar
                  sem o pagamento, volta a valer o vencimento.
                </p>
                <label className="block text-xs font-medium text-gray-500 mt-4 mb-1">Pagar em</label>
                <input
                  type="date"
                  value={dataPrevista}
                  min={hoje}
                  onChange={(e) => setDataPrevista(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => executar({ tipo: 'prevista', dataPrevista: null })}
                  disabled={processando}
                  className="mt-3 text-xs text-gray-500 hover:text-red-600 underline disabled:opacity-50"
                >
                  Remover a data prevista das selecionadas
                </button>
              </>
            )}

            {modal === 'etiqueta' && (
              <>
                <h2 className="font-semibold text-gray-800 text-lg">
                  Etiquetar {selecionadas.length} {selecionadas.length === 1 ? 'despesa' : 'despesas'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">Escolha a etiqueta; vale para todas as selecionadas.</p>
                <div className="mt-4 space-y-2">
                  {OPCOES_ETIQUETA.map((op) => (
                    <button
                      key={op || 'nenhuma'}
                      disabled={processando}
                      onClick={() => executar({ tipo: 'etiqueta', etiqueta: op })}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${op ? ETIQUETA_APROVACAO_COLOR[op].split(' ')[0] : 'bg-gray-300'}`} />
                      {op ? ETIQUETA_APROVACAO_LABEL[op] : 'Sem etiqueta (limpar)'}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(modal === 'pagar' || modal === 'vencimento') && parciais > 0 && (
              <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                {parciais} {parciais === 1 ? 'selecionada tem' : 'selecionadas têm'} pagamento parcial já conciliado e não {parciais === 1 ? 'entra' : 'entram'} aqui.
                Resolva {parciais === 1 ? 'essa' : 'essas'} pela tela da despesa ou pela conciliação.
              </p>
            )}
            {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setModal(null)}
                disabled={processando}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                {modal === 'etiqueta' ? 'Fechar' : 'Cancelar'}
              </button>
              {modal === 'pagar' && (
                <button
                  onClick={() => executar({ tipo: 'pagar', dataPagamento })}
                  disabled={confirmarDesabilitado || !dataPagamento}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processando && <Loader size={14} className="animate-spin" />} Confirmar pagamento
                </button>
              )}
              {modal === 'previsao' && (
                <button
                  onClick={() => executar({ tipo: 'prevista', dataPrevista })}
                  disabled={processando || !dataPrevista}
                  className="flex-1 bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-pink-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processando && <Loader size={14} className="animate-spin" />} Definir data
                </button>
              )}
              {modal === 'vencimento' && (
                <button
                  onClick={() => executar({ tipo: 'vencimento', dataVencimento: novoVencimento })}
                  disabled={confirmarDesabilitado || !novoVencimento}
                  className="flex-1 bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-pink-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processando && <Loader size={14} className="animate-spin" />} Alterar vencimento
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
