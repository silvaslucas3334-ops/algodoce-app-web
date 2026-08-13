'use client'
import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { cancelarOrdem } from '@/lib/ordens'

interface Props {
  ordem: { id: string; numero_ordem: number; produto_nome: string; quantidade: number }
  usuarioQueCancela: { id: string; nome: string }
  onClose: () => void
  onCancelado: () => void
}

// Motivo obrigatório — sem isso quem pediu a ordem só vê "cancelada" sem
// saber por quê, e não consegue decidir o que pedir no lugar.
export default function CancelarOrdemModal({ ordem, usuarioQueCancela, onClose, onCancelado }: Props) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    if (!motivo.trim()) return
    setSalvando(true)
    setErro('')
    try {
      await cancelarOrdem(ordem.id, motivo.trim(), usuarioQueCancela)
      onCancelado()
    } catch (err: any) {
      setErro('Erro ao cancelar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" /> Cancelar ordem
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-gray-500 font-mono text-xs">Ordem #{ordem.numero_ordem}</p>
          <p className="font-semibold text-gray-800">{ordem.produto_nome}</p>
          <p className="text-gray-500">{ordem.quantidade} un.</p>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-2">
          Motivo do cancelamento <span className="text-red-600">*</span>
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex: sem manteiga em estoque, forno quebrado..."
          autoFocus
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-24 resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">Quem pediu essa ordem vai ver esse motivo.</p>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mt-3">{erro}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-3 text-sm font-medium">
            Voltar
          </button>
          <button
            onClick={confirmar}
            disabled={!motivo.trim() || salvando}
            className="flex-1 bg-red-600 text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
          >
            {salvando ? 'Cancelando...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
