'use client'
import { useEffect, useState } from 'react'
import {
  buscarDespesasParaVinculoManual,
  sugerirCombinacaoDespesas,
  confirmarConciliacaoManual,
  confirmarConciliacaoParcial,
  saldoRestante,
} from '@/lib/financeiro-reconciliacao'
import {
  AJUSTE_VAZIO,
  AjusteEstado,
  ajusteValido,
  analisarDiferenca,
  diasEntreISO,
  JANELA_PAGAS_DIAS,
  montarAjuste,
  pagaForaDaJanela,
  TOLERANCIA_DIFERENCA,
} from '@/lib/conciliacao-diferenca'
import { formatBRL } from '@/lib/ofx'
import { normalizarTitulo } from '@/lib/tarefas-utils'
import { FinanceiroExtratoTransacao, FinanceiroLancamento } from '@/lib/types'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import AjusteDiferencaForm from '@/components/AjusteDiferencaForm'
import { X, Search, Loader, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props {
  transacao: FinanceiroExtratoTransacao
  onClose: () => void
  onResolvido: () => void
}

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

/** Data que melhor diz "quando esta despesa foi/será paga": o pagamento, se já foi pago; senão o vencimento. */
function dataDeReferencia(l: FinanceiroLancamento): string {
  return l.status === 'pago' && l.data_pagamento ? l.data_pagamento : l.data_vencimento
}

export default function ConciliarManualModal({ transacao, onClose, onResolvido }: Props) {
  useEscapeKey(onClose)
  const [candidatos, setCandidatos] = useState<FinanceiroLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroParteId, setFiltroParteId] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [mostrarPagasLonge, setMostrarPagasLonge] = useState(false)
  const [ajuste, setAjuste] = useState<AjusteEstado>(AJUSTE_VAZIO)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const valorTransacao = Math.abs(transacao.valor)

  useEffect(() => {
    buscarDespesasParaVinculoManual(transacao.documento_extraido || null)
      .then((lista) => {
        // Documento raramente vem completo em PIX pra pessoa física (banco mascara o CPF) — como segundo
        // palpite, tenta achar o nome do beneficiário dentro da descrição da transação.
        const descNorm = normalizarTitulo(transacao.descricao_original)
        const partesUnicas = new Map(lista.filter((l) => l.parte).map((l) => [l.parte_id, l.parte!.nome]))
        let parteSugerida = ''
        for (const [parteId, nome] of partesUnicas) {
          if (nome.trim().length >= 4 && descNorm.includes(normalizarTitulo(nome))) {
            parteSugerida = parteId
            break
          }
        }
        if (parteSugerida) setFiltroParteId(parteSugerida)

        const ordenada = ordenarPorRelevancia(lista, transacao, parteSugerida)
        setCandidatos(ordenada)
        // A combinação pré-marcada só considera despesas plausíveis: nunca uma compra paga meses antes do
        // débito (foi assim que 5 conciliações ficaram com despesas de junho ligadas a débitos de setembro).
        const plausiveis = ordenada.filter((l) => !pagaForaDaJanela(l, transacao.data))
        const sugestao = sugerirCombinacaoDespesas(plausiveis, valorTransacao)
        if (sugestao.length > 0) setSelecionados(new Set(sugestao))
      })
      .catch((err) => setErro('Erro ao buscar despesas: ' + err.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transacao.id])

  const beneficiarios = Array.from(
    new Map(candidatos.filter((l) => l.parte).map((l) => [l.parte_id, l.parte!.nome])).entries()
  )
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  const filtrados = candidatos.filter((l) => {
    if (filtroParteId && l.parte_id !== filtroParteId) return false
    const termo = busca.trim().toLowerCase()
    if (!termo) return true
    return l.descricao.toLowerCase().includes(termo) || (l.parte?.nome || '').toLowerCase().includes(termo)
  })
  const ocultasPorJanela = filtrados.filter((l) => pagaForaDaJanela(l, transacao.data) && !selecionados.has(l.id))
  const visiveis = mostrarPagasLonge ? filtrados : filtrados.filter((l) => !ocultasPorJanela.includes(l))

  const listaSelecionada = candidatos.filter((l) => selecionados.has(l.id))
  const soma = listaSelecionada.reduce((acc, l) => acc + saldoRestante(l), 0)
  const analise = analisarDiferenca(valorTransacao, soma, selecionados.size)
  const selecionouPagaLonge = listaSelecionada.filter((l) => pagaForaDaJanela(l, transacao.data))

  // Em qual despesa aplicar o ajuste: a escolhida (se ainda selecionada) ou a de maior saldo.
  const alvoPadrao = listaSelecionada.slice().sort((a, b) => saldoRestante(b) - saldoRestante(a))[0]?.id || ''
  const alvoEfetivo = selecionados.has(ajuste.alvoId) ? ajuste.alvoId : alvoPadrao
  const estadoAjuste: AjusteEstado = { ...ajuste, alvoId: alvoEfetivo }
  const confirmacaoValida = selecionados.size > 0 && ajusteValido(estadoAjuste, analise, !!alvoEfetivo)

  // Mudou a seleção (e a diferença): a escolha anterior não vale mais.
  useEffect(() => {
    setAjuste(AJUSTE_VAZIO)
  }, [analise.diferenca])

  const escolheuParcial = analise.exigeResolucao && ajuste.resolucao === 'parcial'
  const escolheuAjuste = analise.exigeResolucao && (ajuste.resolucao === 'ajustar_valor' || ajuste.resolucao === 'juros_taxa')

  function alternar(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function confirmar() {
    if (!confirmacaoValida) return
    setProcessando(true)
    setErro('')
    try {
      if (escolheuParcial) {
        await confirmarConciliacaoParcial(transacao.id, listaSelecionada[0].id, valorTransacao, transacao.data)
      } else {
        const ajusteGravar = montarAjuste(estadoAjuste, analise, alvoEfetivo)
        await confirmarConciliacaoManual(transacao.id, Array.from(selecionados), transacao.data, ajusteGravar)
      }
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao confirmar: ' + err.message)
      setProcessando(false)
    }
  }

  const rotuloBotao = escolheuParcial
    ? `Registrar pagamento parcial (faltam ${formatBRL(analise.absoluta)})`
    : escolheuAjuste
      ? 'Confirmar conciliação com ajuste'
      : 'Confirmar conciliação'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar despesas manualmente"
    >
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">Selecionar despesas manualmente</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
          <p className="font-medium text-gray-800">{transacao.descricao_original}</p>
          <p className="text-gray-500 mt-0.5">
            {fmtData(transacao.data)} · {formatBRL(valorTransacao)}
          </p>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{erro}</div>}

        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar por fornecedor ou descrição..."
              aria-label="Pesquisar despesas"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>
          {beneficiarios.length > 0 && (
            <select
              value={filtroParteId}
              onChange={(e) => setFiltroParteId(e.target.value)}
              aria-label="Filtrar por beneficiário"
              className="border border-gray-300 rounded-lg px-2 py-2.5 text-sm bg-white max-w-[45%]"
            >
              <option value="">Todos os beneficiários</option>
              {beneficiarios.map((b) => (
                <option key={b.id} value={b.id}>{b.nome}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 mb-3 min-h-[120px]">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader size={18} className="animate-spin" /> Buscando despesas...
            </div>
          ) : visiveis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Nenhuma despesa sem vínculo encontrada{busca ? ` para "${busca}"` : ''}
              {filtroParteId ? ' para este beneficiário' : ''}.
            </p>
          ) : (
            visiveis.map((l) => {
              const longe = pagaForaDaJanela(l, transacao.data)
              const dias = l.status === 'pago' && l.data_pagamento ? Math.abs(diasEntreISO(l.data_pagamento, transacao.data)) : 0
              return (
                <label
                  key={l.id}
                  className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer ${
                    selecionados.has(l.id) ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selecionados.has(l.id)}
                    onChange={() => alternar(l.id)}
                    aria-label={`Selecionar ${l.descricao}`}
                    className="w-4 h-4 rounded mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{l.descricao}</p>
                    <p className="text-xs text-gray-500">
                      {l.parte?.nome} · lançada em {fmtData(l.data_lancamento)}
                      {l.status === 'pago' && l.data_pagamento ? ` · já paga em ${fmtData(l.data_pagamento)}` : l.status === 'pago' ? ' · já paga' : ` · vence ${fmtData(l.data_vencimento)}`}
                    </p>
                    {longe && (
                      <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                        <AlertTriangle size={11} /> paga {dias} dias {l.data_pagamento! < transacao.data ? 'antes' : 'depois'} deste débito — confira se é o mesmo pagamento
                      </p>
                    )}
                    {(l.valor_pago_conciliado || 0) > 0 && (
                      <p className="text-xs text-blue-600 font-medium">
                        já pago {formatBRL(l.valor_pago_conciliado || 0)} · faltam {formatBRL(saldoRestante(l))}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{formatBRL(l.valor_total)}</span>
                </label>
              )
            })
          )}
          {!loading && ocultasPorJanela.length > 0 && (
            <button
              type="button"
              onClick={() => setMostrarPagasLonge((v) => !v)}
              className="w-full text-xs font-medium text-gray-500 hover:text-gray-700 py-2"
            >
              {mostrarPagasLonge
                ? 'Ocultar as já pagas fora de ±' + JANELA_PAGAS_DIAS + ' dias'
                : `Mostrar mais ${ocultasPorJanela.length} despesa(s) já paga(s) há mais de ${JANELA_PAGAS_DIAS} dias deste débito`}
            </button>
          )}
        </div>

        <div className="border-t border-gray-200 pt-3 space-y-2 overflow-y-auto max-h-[45vh]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {selecionados.size} despesa{selecionados.size === 1 ? '' : 's'} selecionada{selecionados.size === 1 ? '' : 's'}
            </span>
            <span className="font-semibold text-gray-800">{formatBRL(soma)}</span>
          </div>

          {selecionouPagaLonge.length > 0 && (
            <div className="text-xs rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 flex gap-1.5">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                {selecionouPagaLonge.length} despesa(s) selecionada(s) já {selecionouPagaLonge.length === 1 ? 'foi paga' : 'foram pagas'} há mais de{' '}
                {JANELA_PAGAS_DIAS} dias deste débito. Vincular aqui só faz sentido se for mesmo o mesmo pagamento.
              </span>
            </div>
          )}

          {selecionados.size > 0 && analise.dentroDaTolerancia && (
            <div className="text-sm rounded-lg px-3 py-2 bg-blue-50 text-blue-700">
              Diferença de {formatBRL(analise.absoluta)} ({analise.diferenca > 0 ? 'banco pagou mais' : 'banco pagou menos'}) dentro da
              tolerância de {formatBRL(TOLERANCIA_DIFERENCA)} — pode confirmar. As despesas mantêm o valor lançado.
            </div>
          )}

          {selecionados.size > 0 && (
            <AjusteDiferencaForm
              analise={analise}
              estado={estadoAjuste}
              onChange={setAjuste}
              idBase="manual"
              alvos={
                selecionados.size > 1
                  ? listaSelecionada.map((l) => ({ id: l.id, rotulo: `${l.parte?.nome || '—'} · ${l.descricao} · ${formatBRL(saldoRestante(l))}` }))
                  : undefined
              }
            />
          )}

          <button
            onClick={confirmar}
            disabled={processando || !confirmacaoValida}
            className={`w-full text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${
              escolheuParcial ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {processando ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {rotuloBotao}
          </button>
          {analise.exigeResolucao && !confirmacaoValida && selecionados.size > 0 && (
            <p className="text-[11px] text-gray-500 text-center">Escolha o que aconteceu com a diferença e informe o motivo para liberar o botão.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Lista ordenada por relevância para este débito: primeiro o fornecedor que casa com o documento/nome da
 * transação, depois as despesas cuja data de pagamento/vencimento está mais perto da data do banco.
 * (Antes vinha por data de lançamento crescente — a combinação sugerida saía das compras mais antigas.)
 */
function ordenarPorRelevancia(lista: FinanceiroLancamento[], transacao: FinanceiroExtratoTransacao, parteSugerida: string): FinanceiroLancamento[] {
  const doc = transacao.documento_extraido
  const peso = (l: FinanceiroLancamento) => (doc && l.parte?.documento === doc) || (parteSugerida && l.parte_id === parteSugerida) ? 0 : 1
  return [...lista].sort((a, b) => {
    const pa = peso(a)
    const pb = peso(b)
    if (pa !== pb) return pa - pb
    const da = Math.abs(diasEntreISO(dataDeReferencia(a), transacao.data))
    const db = Math.abs(diasEntreISO(dataDeReferencia(b), transacao.data))
    return da - db
  })
}
