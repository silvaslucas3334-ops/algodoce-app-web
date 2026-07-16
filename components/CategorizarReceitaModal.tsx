'use client'
import { useState } from 'react'
import { categorizarReceita } from '@/lib/financeiro-receitas'
import { ignorarTransacao } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { CATEGORIA_RECEITA_LABEL } from '@/lib/constants'
import { FinanceiroExtratoTransacao, CategoriaReceita } from '@/lib/types'
import { X, Loader, CheckCircle } from 'lucide-react'

interface Props {
  transacao: FinanceiroExtratoTransacao
  unidade: 'loja1' | 'loja2'
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

// Categorias em que o valor que cai no banco é líquido de uma taxa
// (cartão/plataforma) — só nelas faz sentido pedir o valor bruto, pro DRE
// calcular a taxa como diferença.
const CATEGORIAS_COM_TAXA: Exclude<CategoriaReceita, 'dinheiro'>[] = ['venda_cartao', 'repasse_ifood', 'repasse_aiqfome']

export default function CategorizarReceitaModal({ transacao, unidade, usuarioId, onClose, onResolvido }: Props) {
  const [categoria, setCategoria] = useState<Exclude<CategoriaReceita, 'dinheiro'> | ''>('')
  const [valorBruto, setValorBruto] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  const valorBrutoNum = valorBruto ? Number(valorBruto) : null
  const valorBrutoValido = valorBrutoNum == null || valorBrutoNum >= transacao.valor

  async function confirmar() {
    if (!categoria || !valorBrutoValido) return
    setProcessando(true)
    setErro('')
    try {
      await categorizarReceita(
        transacao.id,
        unidade,
        categoria,
        transacao.valor,
        transacao.data,
        null,
        usuarioId,
        valorBrutoNum ?? undefined
      )
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao categorizar: ' + err.message)
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Categorizar entrada</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-gray-800">{transacao.descricao_original}</p>
          <p className="text-gray-500 mt-0.5">
            {new Date(transacao.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {formatBRL(transacao.valor)}
          </p>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {CATEGORIAS.map((c) => {
            const ativo = categoria === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-all ${
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

        {categoria && CATEGORIAS_COM_TAXA.includes(categoria) && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Valor bruto da venda (opcional)</label>
            <input
              type="number"
              step="0.01"
              min={transacao.valor}
              value={valorBruto}
              onChange={(e) => setValorBruto(e.target.value)}
              placeholder={formatBRL(transacao.valor)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              {valorBruto
                ? `Taxa retida: ${formatBRL(Math.max(0, (valorBrutoNum || 0) - transacao.valor))}`
                : 'Se preenchido, o DRE calcula a taxa de cartão/plataforma como a diferença. Deixe em branco se não souber.'}
            </p>
            {!valorBrutoValido && <p className="text-xs text-red-600 mt-1">O valor bruto não pode ser menor que o valor recebido ({formatBRL(transacao.valor)}).</p>}
          </div>
        )}

        <button
          onClick={confirmar}
          disabled={processando || !categoria || !valorBrutoValido}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
        >
          {processando ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />} Confirmar
        </button>

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
