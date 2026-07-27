'use client'
import { useEffect, useState } from 'react'
import { listarImportacoesRecentes, reverterImportacao, LoteImportacao } from '@/lib/financeiro-reconciliacao'
import { UNIDADE_LABEL } from '@/lib/constants'
import { X, Loader, Trash2 } from 'lucide-react'

interface Props {
  onClose: () => void
  onResolvido: () => void
}

export default function ReverterImportacaoModal({ onClose, onResolvido }: Props) {
  const [lotes, setLotes] = useState<LoteImportacao[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  function carregar() {
    setLoading(true)
    listarImportacoesRecentes()
      .then(setLotes)
      .catch((err) => setErro('Erro ao carregar importações: ' + err.message))
      .finally(() => setLoading(false))
  }

  async function reverter(lote: LoteImportacao) {
    const chave = `${lote.contaBancaria}|${lote.importadoEm}`
    if (
      !confirm(
        `Remover ${lote.pendentes} transação(ões) pendente(s) deste lote (${UNIDADE_LABEL[lote.contaBancaria]})?\n\nTransações já conciliadas ou ignoradas não serão afetadas.`
      )
    ) {
      return
    }
    setProcessando(chave)
    setErro('')
    try {
      await reverterImportacao(lote.contaBancaria, lote.importadoEm)
      carregar()
      onResolvido()
    } catch (err: any) {
      setErro('Erro ao reverter: ' + err.message)
    } finally {
      setProcessando(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Importações recentes</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Se um extrato foi importado pra loja errada, reverta o lote aqui. Só transações ainda pendentes são removidas.
        </p>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader size={18} className="animate-spin" /> Carregando...
          </div>
        ) : lotes.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">Nenhuma importação nos últimos 60 dias.</p>
        ) : (
          <div className="space-y-2">
            {lotes.map((lote) => {
              const chave = `${lote.contaBancaria}|${lote.importadoEm}`
              return (
                <div key={chave} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{UNIDADE_LABEL[lote.contaBancaria]}</p>
                    <p className="text-xs text-gray-500">{new Date(lote.importadoEm).toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {lote.total} transaç{lote.total === 1 ? 'ão' : 'ões'} — {lote.pendentes} pendente
                      {lote.pendentes === 1 ? '' : 's'}
                      {lote.conciliados > 0 && `, ${lote.conciliados} já conciliada${lote.conciliados === 1 ? '' : 's'}`}
                      {lote.ignorados > 0 && `, ${lote.ignorados} ignorada${lote.ignorados === 1 ? '' : 's'}`}
                    </p>
                  </div>
                  <button
                    onClick={() => reverter(lote)}
                    disabled={lote.pendentes === 0 || processando === chave}
                    className="flex-shrink-0 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {processando === chave ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Reverter
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
