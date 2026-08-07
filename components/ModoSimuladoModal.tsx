'use client'
import { useState } from 'react'
import { X } from 'lucide-react'
import { FluxoMensalAtrasadoItem, SimulacaoAtrasadoItem } from '@/lib/financeiro-fluxo-mensal'
import { formatBRL } from '@/lib/ofx'
import { hojeISO } from '@/lib/financeiro-utils'

interface Props {
  atrasados: FluxoMensalAtrasadoItem[]
  simulacaoAtual: SimulacaoAtrasadoItem[]
  onClose: () => void
  onAplicar: (simulacao: SimulacaoAtrasadoItem[]) => void
}

// "E se eu pagasse esses atrasados em tal data?" — não altera nada de
// verdade (financeiro_lancamentos continua com status/vencimento originais),
// só recalcula a visão do calendário em cima do que o usuário escolher aqui.
export default function ModoSimuladoModal({ atrasados, simulacaoAtual, onClose, onAplicar }: Props) {
  const hoje = hojeISO()
  const [selecoes, setSelecoes] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {}
    simulacaoAtual.forEach((s) => { inicial[s.lancamentoId] = s.dataSimulada })
    return inicial
  })

  function alternar(item: FluxoMensalAtrasadoItem, marcado: boolean) {
    setSelecoes((prev) => {
      const novo = { ...prev }
      if (marcado) novo[item.lancamentoId] = novo[item.lancamentoId] || hoje
      else delete novo[item.lancamentoId]
      return novo
    })
  }

  function mudarData(lancamentoId: string, data: string) {
    setSelecoes((prev) => ({ ...prev, [lancamentoId]: data }))
  }

  function aplicar() {
    const simulacao: SimulacaoAtrasadoItem[] = atrasados
      .filter((a) => selecoes[a.lancamentoId])
      .map((a) => ({ ...a, dataSimulada: selecoes[a.lancamentoId] }))
    onAplicar(simulacao)
    onClose()
  }

  const quantidadeSelecionada = Object.keys(selecoes).length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-lg w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-800">Modo Simulado</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Escolha quais despesas atrasadas incluir no planejamento e quando pretende pagar cada uma —
          sem alterar nada de verdade, é só uma simulação.
        </p>

        {atrasados.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma despesa atrasada no momento.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {atrasados.map((item) => {
              const marcado = !!selecoes[item.lancamentoId]
              return (
                <div
                  key={item.lancamentoId}
                  className={`border rounded-lg p-3 ${marcado ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => alternar(item, e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-amber-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.parteNome}</p>
                      <p className="text-xs text-gray-500">
                        {item.contaNome} · {item.diasAtraso}d de atraso
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 flex-shrink-0">{formatBRL(item.valor)}</p>
                  </label>
                  {marcado && (
                    <div className="mt-2 pl-6">
                      <label className="block text-xs text-gray-500 mb-1">Quando pretende pagar?</label>
                      <input
                        type="date"
                        min={hoje}
                        value={selecoes[item.lancamentoId]}
                        onChange={(e) => mudarData(item.lancamentoId, e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={aplicar}
            className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-amber-600 text-white hover:bg-amber-700"
          >
            {quantidadeSelecionada > 0 ? `Simular ${quantidadeSelecionada}` : 'Sair do modo simulado'}
          </button>
        </div>
      </div>
    </div>
  )
}
