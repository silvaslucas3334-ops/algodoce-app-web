'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sugerirCorrespondencias, confirmarConciliacao, confirmarConciliacaoJaPago, ignorarTransacao } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { CandidatoConciliacao, FinanceiroExtratoTransacao } from '@/lib/types'
import { TIPO_LANCAMENTO_LABEL } from '@/lib/constants'
import { X, Loader, CheckCircle, Receipt, ShoppingCart } from 'lucide-react'

interface Props {
  transacao: FinanceiroExtratoTransacao
  onClose: () => void
  onResolvido: () => void
}

const CONFIANCA_LABEL: Record<string, { label: string; color: string }> = {
  alta: { label: 'Confiança alta (CNPJ/CPF bate)', color: 'bg-green-100 text-green-700' },
  media: { label: 'Confiança média (vencimento próximo)', color: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Confiança baixa (só o valor bate)', color: 'bg-gray-100 text-gray-600' },
}

export default function ExtratoConciliacaoModal({ transacao, onClose, onResolvido }: Props) {
  const router = useRouter()
  const [candidatos, setCandidatos] = useState<CandidatoConciliacao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    sugerirCorrespondencias(transacao.valor, transacao.data, transacao.documento_extraido || null)
      .then(setCandidatos)
      .catch((err) => setErro('Erro ao buscar correspondências: ' + err.message))
      .finally(() => setLoading(false))
  }, [transacao.id])

  async function confirmar(candidato: CandidatoConciliacao) {
    setProcessando(true)
    setErro('')
    try {
      if (candidato.jaPago) {
        await confirmarConciliacaoJaPago(transacao.id, candidato.lancamento.id, candidato.lancamento.parte_id)
      } else {
        await confirmarConciliacao(transacao.id, candidato, transacao.data)
      }
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao confirmar: ' + err.message)
      setProcessando(false)
    }
  }

  async function ignorar() {
    setProcessando(true)
    setErro('')
    try {
      await ignorarTransacao(transacao.id)
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao ignorar: ' + err.message)
      setProcessando(false)
    }
  }

  function irParaNovoLancamento(destino: 'despesas' | 'compras') {
    const params = new URLSearchParams({
      extratoTransacaoId: transacao.id,
      valor: String(Math.abs(transacao.valor)),
      data: transacao.data,
      unidade: transacao.conta_bancaria,
    })
    if (transacao.documento_extraido) params.set('documento', transacao.documento_extraido)
    router.push(`/financeiro/${destino}/nova?${params.toString()}`)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Conciliar transação</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-gray-800">{transacao.descricao_original}</p>
          <p className="text-gray-500 mt-0.5">
            {new Date(transacao.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {formatBRL(Math.abs(transacao.valor))}
          </p>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> Buscando correspondências...
          </div>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            Nenhum lançamento (aberto ou pago) com esse valor. Confira se já foi lançado, ou ignore esta transação.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {candidatos.map((c, i) => {
              const conf = CONFIANCA_LABEL[c.confianca]
              const l = c.lancamento
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{l.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {l.parte?.nome} · {formatBRL(l.valor_total)} · venc.{' '}
                        {new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                          {TIPO_LANCAMENTO_LABEL[l.tipo]}
                          {l.parcela_num && l.parcela_total ? ` · parcela ${l.parcela_num}/${l.parcela_total}` : ''}
                        </span>
                        {c.jaPago && (
                          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">
                            Já pago no sistema — só vincular
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${conf.color}`}>{conf.label}</span>
                  </div>
                  <button
                    onClick={() => confirmar(c)}
                    disabled={processando}
                    className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> {c.jaPago ? 'Vincular a este' : 'Confirmar este'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 text-center mb-2">ou lance um novo registro:</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={() => irParaNovoLancamento('despesas')}
            disabled={processando}
            className="border-2 border-blue-200 text-blue-700 rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Receipt size={15} /> Nova Despesa
          </button>
          <button
            onClick={() => irParaNovoLancamento('compras')}
            disabled={processando}
            className="border-2 border-blue-200 text-blue-700 rounded-lg py-2.5 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ShoppingCart size={15} /> Nota de Insumos
          </button>
        </div>

        <button
          onClick={ignorar}
          disabled={processando}
          className="w-full border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Ignorar esta transação
        </button>
      </div>
    </div>
  )
}
