'use client'
import { useState } from 'react'
import { categorizarReceitasEmLote } from '@/lib/financeiro-receitas'
import { formatBRL } from '@/lib/ofx'
import { CATEGORIA_RECEITA_LABEL } from '@/lib/constants'
import { FinanceiroExtratoTransacao, CategoriaReceita } from '@/lib/types'
import { X, Loader, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props {
  transacoes: FinanceiroExtratoTransacao[]
  usuarioId: string
  onClose: () => void
  onResolvido: () => void
}

// 'dinheiro' não aparece aqui — nunca tem transação de extrato associada,
// é lançada manualmente (ver NovaReceitaDinheiroModal).
const CATEGORIAS: Exclude<CategoriaReceita, 'dinheiro'>[] = [
  'venda_cartao',
  'pix',
  'repasse_ifood',
  'repasse_aiqfome',
  'outros',
]

export default function CategorizarReceitasLoteModal({ transacoes, usuarioId, onClose, onResolvido }: Props) {
  const [categoria, setCategoria] = useState<Exclude<CategoriaReceita, 'dinheiro'> | ''>('')
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ sucesso: number; falhas: { transacao: FinanceiroExtratoTransacao; erro: string }[] } | null>(null)
  const [erro, setErro] = useState('')

  const total = transacoes.reduce((acc, t) => acc + t.valor, 0)

  async function confirmar() {
    if (!categoria) return
    setProcessando(true)
    setErro('')
    setProgresso(0)
    try {
      const res = await categorizarReceitasEmLote(transacoes, categoria, usuarioId, (concluidas) => setProgresso(concluidas))
      onResolvido()
      if (res.falhas.length === 0) {
        onClose()
      } else {
        setResultado(res)
        setProcessando(false)
      }
    } catch (err: any) {
      setErro('Erro ao categorizar em lote: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Categorizar em lote</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {!resultado ? (
          <>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-gray-800">{transacoes.length} transações selecionadas</p>
              <p className="text-gray-500 mt-0.5">Total: {formatBRL(total)}</p>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

            <label className="block text-sm font-medium text-gray-700 mb-2">Categoria (aplicada a todas)</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {CATEGORIAS.map((c) => {
                const ativo = categoria === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoria(c)}
                    disabled={processando}
                    className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-all disabled:opacity-50 ${
                      ativo
                        ? 'border-pink-600 bg-pink-50 text-pink-800 font-semibold'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                        ativo ? 'border-pink-600 bg-pink-600' : 'border-gray-300'
                      }`}
                    />
                    {CATEGORIA_RECEITA_LABEL[c]}
                  </button>
                )
              })}
            </div>

            <button
              onClick={confirmar}
              disabled={processando || !categoria}
              className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processando ? (
                <>
                  <Loader size={16} className="animate-spin" /> Processando {progresso}/{transacoes.length}...
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Classificar {transacoes.length} {transacoes.length === 1 ? 'transação' : 'transações'}
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-700">
              {resultado.sucesso} de {transacoes.length} categorizadas com sucesso.
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <p className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14} /> {resultado.falhas.length} falharam:
              </p>
              <ul className="space-y-1 text-xs">
                {resultado.falhas.map((f) => (
                  <li key={f.transacao.id}>{f.transacao.descricao_original} — {f.erro}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={onClose}
              className="w-full border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
