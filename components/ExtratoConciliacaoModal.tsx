'use client'
import { useEffect, useState } from 'react'
import { sugerirCorrespondencias, confirmarConciliacao, ignorarTransacao } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { CandidatoConciliacao, FinanceiroCompraInsumo, FinanceiroDespesa, FinanceiroExtratoTransacao } from '@/lib/types'
import { X, Loader, CheckCircle, FileText } from 'lucide-react'

interface Props {
  transacao: FinanceiroExtratoTransacao
  onClose: () => void
  onResolvido: () => void
}

const CONFIANCA_LABEL: Record<string, { label: string; color: string }> = {
  alta: { label: 'Confiança alta (CNPJ/CPF bate)', color: 'bg-green-100 text-green-700' },
  media: { label: 'Confiança média (data próxima)', color: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Confiança baixa (só o valor bate)', color: 'bg-gray-100 text-gray-600' },
}

export default function ExtratoConciliacaoModal({ transacao, onClose, onResolvido }: Props) {
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
      await confirmarConciliacao(transacao.id, candidato, transacao.data)
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

  const nomeParte = (c: CandidatoConciliacao) =>
    c.tipo === 'compra_insumo'
      ? (c.registros[0] as FinanceiroCompraInsumo).fornecedor?.nome || 'Fornecedor'
      : (c.registros[0] as FinanceiroDespesa).parte?.nome || 'Beneficiário'

  const valorCandidato = (c: CandidatoConciliacao) =>
    c.registros.reduce(
      (acc, r) => acc + (c.tipo === 'compra_insumo' ? (r as FinanceiroCompraInsumo).valor_total : (r as FinanceiroDespesa).valor),
      0
    )

  const tituloCandidato = (c: CandidatoConciliacao) => {
    if (c.tipo === 'despesa_geral') return (c.registros[0] as FinanceiroDespesa).descricao
    if (c.registros.length === 1) {
      return (c.registros[0] as FinanceiroCompraInsumo).materia_prima?.nome || 'Compra de insumo'
    }
    return `NF ${c.numero_nota_fiscal} — ${c.registros.length} itens`
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
            Nenhuma despesa/compra em aberto com esse valor (nem nota fiscal cuja soma dos itens bata).
            Confira se já foi lançada, ou ignore esta transação.
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {candidatos.map((c, i) => {
              const conf = CONFIANCA_LABEL[c.confianca]
              const ehGrupo = c.registros.length > 1
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        {ehGrupo && <FileText size={14} className="text-blue-600" />}
                        {tituloCandidato(c)}
                      </p>
                      <p className="text-xs text-gray-500">{nomeParte(c)} · {formatBRL(valorCandidato(c))}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${conf.color}`}>{conf.label}</span>
                  </div>

                  {ehGrupo && (
                    <div className="mb-2 pl-2 border-l-2 border-blue-100 space-y-0.5">
                      {c.registros.map((r) => {
                        const compra = r as FinanceiroCompraInsumo
                        return (
                          <p key={r.id} className="text-xs text-gray-600">
                            {compra.materia_prima?.nome || 'Item'} · {formatBRL(compra.valor_total)}
                          </p>
                        )
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => confirmar(c)}
                    disabled={processando}
                    className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} /> {ehGrupo ? `Confirmar nota (${c.registros.length} itens)` : 'Confirmar este'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

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
