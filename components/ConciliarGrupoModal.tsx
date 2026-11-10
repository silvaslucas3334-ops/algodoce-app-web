'use client'
import { useEffect, useState } from 'react'
import { sugerirCorrespondenciasPorSoma, confirmarConciliacaoGrupo } from '@/lib/financeiro-reconciliacao'
import {
  AJUSTE_VAZIO,
  AjusteEstado,
  ajusteValido,
  analisarDiferenca,
  montarAjuste,
  TOLERANCIA_DIFERENCA,
} from '@/lib/conciliacao-diferenca'
import { formatBRL } from '@/lib/ofx'
import { CandidatoConciliacao, FinanceiroExtratoTransacao } from '@/lib/types'
import { TIPO_LANCAMENTO_LABEL } from '@/lib/constants'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import AjusteDiferencaForm from '@/components/AjusteDiferencaForm'
import { X, Loader, CheckCircle } from 'lucide-react'

interface Props {
  transacoes: FinanceiroExtratoTransacao[]
  onClose: () => void
  onResolvido: () => void
}

// Sem CNPJ/CPF aqui — descrições de amortização de contrato não trazem
// documento, então a confiança nunca chega a 'alta' neste fluxo.
const CONFIANCA_LABEL: Record<string, { label: string; color: string }> = {
  media: { label: 'Confiança média (vencimento próximo)', color: 'bg-amber-100 text-amber-700' },
  baixa: { label: 'Confiança baixa (só a soma bate)', color: 'bg-gray-100 text-gray-600' },
}

export default function ConciliarGrupoModal({ transacoes, onClose, onResolvido }: Props) {
  useEscapeKey(onClose)
  const [candidatos, setCandidatos] = useState<CandidatoConciliacao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  // uma escolha de ajuste por candidato (cada cartão decide sobre a SUA diferença)
  const [ajustes, setAjustes] = useState<Record<string, AjusteEstado>>({})

  const soma = transacoes.reduce((acc, t) => acc + Math.abs(t.valor), 0)
  const dataMaisRecente = transacoes.reduce((max, t) => (t.data > max ? t.data : max), transacoes[0]?.data || '')
  const idsOrdenados = transacoes.map((t) => t.id)

  useEffect(() => {
    sugerirCorrespondenciasPorSoma(soma, dataMaisRecente)
      .then(setCandidatos)
      .catch((err) => setErro('Erro ao buscar correspondências: ' + err.message))
      .finally(() => setLoading(false))
  }, [])

  async function confirmar(candidato: CandidatoConciliacao, analise: ReturnType<typeof analisarDiferenca>, estado: AjusteEstado) {
    setProcessando(true)
    setErro('')
    try {
      const ajuste = montarAjuste(estado, analise, candidato.lancamento.id)
      await confirmarConciliacaoGrupo(idsOrdenados, candidato, dataMaisRecente, ajuste)
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro(err.message)
      setProcessando(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Conciliar em grupo"
    >
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Conciliar em grupo</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
          <p className="font-medium text-gray-800 mb-1">{transacoes.length} transações selecionadas</p>
          {transacoes
            .slice()
            .sort((a, b) => a.data.localeCompare(b.data))
            .map((t) => (
              <p key={t.id} className="text-xs text-gray-500 flex justify-between gap-2">
                <span className="truncate">
                  {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {t.descricao_original}
                </span>
                <span className="flex-shrink-0">{formatBRL(Math.abs(t.valor))}</span>
              </p>
            ))}
          <p className="text-sm font-semibold text-gray-800 pt-1.5 mt-1 border-t border-gray-200 flex justify-between">
            <span>Soma</span> <span>{formatBRL(soma)}</span>
          </p>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> Buscando despesas com essa soma...
          </div>
        ) : candidatos.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">
            Nenhuma despesa (aberta ou já paga) bate com essa soma. Confira se selecionou todas as parcelas do lançamento, ou ajuste a seleção.
          </p>
        ) : (
          <div className="space-y-2">
            {candidatos.map((c, i) => {
              const conf = CONFIANCA_LABEL[c.confianca] || CONFIANCA_LABEL.baixa
              const l = c.lancamento
              // qtd=2 só para não oferecer "pagamento parcial" (não existe no fluxo em grupo)
              const analise = analisarDiferenca(soma, l.valor_total, 2)
              const estado = ajustes[l.id] || AJUSTE_VAZIO
              const podeConfirmar = ajusteValido(estado, analise, true)
              return (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{l.descricao}</p>
                      <p className="text-xs text-gray-500">
                        {l.parte?.nome} · {formatBRL(l.valor_total)} · venc.{' '}
                        {new Date(l.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                        {TIPO_LANCAMENTO_LABEL[l.tipo]}
                        {l.parcela_num && l.parcela_total ? ` · parcela ${l.parcela_num}/${l.parcela_total}` : ''}
                      </span>
                      {c.jaPago && (
                        <span className="inline-block mt-1 ml-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">
                          Já pago no sistema — só vincular
                        </span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${conf.color}`}>{conf.label}</span>
                  </div>

                  {analise.dentroDaTolerancia && (
                    <p className="text-xs mb-2 px-2 py-1 rounded bg-blue-50 text-blue-700">
                      Diferença de {formatBRL(analise.absoluta)} dentro da tolerância de {formatBRL(TOLERANCIA_DIFERENCA)} — pode confirmar.
                    </p>
                  )}
                  <div className="mb-2">
                    <AjusteDiferencaForm
                      analise={analise}
                      estado={estado}
                      onChange={(novo) => setAjustes((prev) => ({ ...prev, [l.id]: novo }))}
                      idBase={`grupo-${i}`}
                    />
                  </div>

                  <button
                    onClick={() => confirmar(c, analise, estado)}
                    disabled={processando || !podeConfirmar}
                    className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={16} />{' '}
                    {analise.exigeResolucao ? 'Confirmar com ajuste' : c.jaPago ? 'Vincular a este' : 'Confirmar este'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
