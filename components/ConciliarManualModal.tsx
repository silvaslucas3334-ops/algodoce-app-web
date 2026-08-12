'use client'
import { useEffect, useState } from 'react'
import {
  buscarDespesasParaVinculoManual,
  sugerirCombinacaoDespesas,
  confirmarConciliacaoManual,
  confirmarConciliacaoParcial,
  saldoRestante,
} from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { normalizarTitulo } from '@/lib/tarefas-utils'
import { FinanceiroExtratoTransacao, FinanceiroLancamento } from '@/lib/types'
import { X, Search, Loader, CheckCircle } from 'lucide-react'

interface Props {
  transacao: FinanceiroExtratoTransacao
  onClose: () => void
  onResolvido: () => void
}

// Diferença considerada "juros/multa aplicável" só quando positiva (o banco
// cobrou mais do que foi lançado) e dentro de um teto sensato — evita que um
// erro de seleção grosseiro vire um ajuste automático sem sentido.
const TETO_JUROS_MULTA = 100

export default function ConciliarManualModal({ transacao, onClose, onResolvido }: Props) {
  const [candidatos, setCandidatos] = useState<FinanceiroLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroParteId, setFiltroParteId] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [aplicarJuros, setAplicarJuros] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const valorTransacao = Math.abs(transacao.valor)

  useEffect(() => {
    buscarDespesasParaVinculoManual(transacao.documento_extraido || null)
      .then((lista) => {
        setCandidatos(lista)
        const sugestao = sugerirCombinacaoDespesas(lista, valorTransacao)
        if (sugestao.length > 0) setSelecionados(new Set(sugestao))

        // Documento raramente vem completo em PIX pra pessoa física (banco
        // mascara o CPF) — como segundo palpite, tenta achar o nome do
        // beneficiário dentro da descrição da transação. Só pré-seleciona o
        // filtro; o usuário sempre pode trocar pra "Todos" na mão.
        const descNorm = normalizarTitulo(transacao.descricao_original)
        const partesUnicas = new Map(lista.filter((l) => l.parte).map((l) => [l.parte_id, l.parte!.nome]))
        for (const [parteId, nome] of partesUnicas) {
          if (nome.trim().length >= 4 && descNorm.includes(normalizarTitulo(nome))) {
            setFiltroParteId(parteId)
            break
          }
        }
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

  const listaSelecionada = candidatos.filter((l) => selecionados.has(l.id))
  const soma = listaSelecionada.reduce((acc, l) => acc + saldoRestante(l), 0)
  const diferenca = valorTransacao - soma
  const bateExato = Math.abs(diferenca) < 0.01
  const jurosAplicavel = selecionados.size === 1 && diferenca > 0.01 && diferenca <= TETO_JUROS_MULTA
  // Banco pagou menos do que ainda falta desta despesa — é o caso de conta
  // sem saldo pro valor total, debitando aos poucos. Só faz sentido com 1
  // despesa selecionada (com várias, "qual delas ficou parcial?" é ambíguo).
  const pagamentoParcialAplicavel = selecionados.size === 1 && diferenca < -0.01

  function alternar(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function confirmar() {
    if (selecionados.size === 0) return
    setProcessando(true)
    setErro('')
    try {
      if (pagamentoParcialAplicavel) {
        await confirmarConciliacaoParcial(transacao.id, listaSelecionada[0].id, valorTransacao, transacao.data)
      } else {
        const ajuste =
          jurosAplicavel && aplicarJuros
            ? { lancamentoId: listaSelecionada[0].id, valor: diferenca }
            : undefined
        await confirmarConciliacaoManual(transacao.id, Array.from(selecionados), transacao.data, ajuste)
      }
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao confirmar: ' + err.message)
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">Selecionar despesas manualmente</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm">
          <p className="font-medium text-gray-800">{transacao.descricao_original}</p>
          <p className="text-gray-500 mt-0.5">
            {new Date(transacao.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {formatBRL(valorTransacao)}
          </p>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700">{erro}</div>}

        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Pesquisar por fornecedor ou descrição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>
          {beneficiarios.length > 0 && (
            <select
              value={filtroParteId}
              onChange={(e) => setFiltroParteId(e.target.value)}
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
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Nenhuma despesa sem vínculo encontrada{busca ? ` para "${busca}"` : ''}
              {filtroParteId ? ' para este beneficiário' : ''}.
            </p>
          ) : (
            filtrados.map((l) => (
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
                  className="w-4 h-4 rounded mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{l.descricao}</p>
                  <p className="text-xs text-gray-500">
                    {l.parte?.nome} · lançada em {new Date(l.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    {l.status === 'pago' ? ' · já pago' : ''}
                  </p>
                  {(l.valor_pago_conciliado || 0) > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      já pago {formatBRL(l.valor_pago_conciliado || 0)} · faltam {formatBRL(saldoRestante(l))}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-700 whitespace-nowrap">{formatBRL(l.valor_total)}</span>
              </label>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 pt-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {selecionados.size} despesa{selecionados.size === 1 ? '' : 's'} selecionada{selecionados.size === 1 ? '' : 's'}
            </span>
            <span className="font-semibold text-gray-800">{formatBRL(soma)}</span>
          </div>
          {selecionados.size > 0 && !bateExato && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                pagamentoParcialAplicavel ? 'bg-blue-50 text-blue-700' : diferenca > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {pagamentoParcialAplicavel ? (
                <>Conta sem saldo pro valor todo? Essa despesa fica em aberto e ainda faltam {formatBRL(Math.abs(diferenca))}.</>
              ) : (
                <>Diferença de {formatBRL(Math.abs(diferenca))} {diferenca > 0 ? '(banco pagou mais)' : '(banco pagou menos)'}</>
              )}
              {jurosAplicavel && (
                <label className="flex items-center gap-2 mt-1.5 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={aplicarJuros}
                    onChange={(e) => setAplicarJuros(e.target.checked)}
                    className="w-3.5 h-3.5 rounded"
                  />
                  Registrar como juros/multa por atraso nesta despesa
                </label>
              )}
            </div>
          )}

          <button
            onClick={confirmar}
            disabled={processando || selecionados.size === 0}
            className={`w-full text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${
              pagamentoParcialAplicavel ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {processando ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            {pagamentoParcialAplicavel ? `Registrar pagamento parcial (faltam ${formatBRL(Math.abs(diferenca))})` : 'Confirmar conciliação'}
          </button>
        </div>
      </div>
    </div>
  )
}
