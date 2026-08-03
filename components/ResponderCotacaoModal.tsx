'use client'
import { useState } from 'react'
import { responderCotacaoFornecedor, RespostaItemCotacao } from '@/lib/financeiro-cotacoes'
import { formatBRL } from '@/lib/ofx'
import { FinanceiroCotacaoFornecedor, FinanceiroCotacaoItem, FinanceiroCotacaoPreco } from '@/lib/types'
import { X, Loader, CheckCircle } from 'lucide-react'

interface Props {
  cotacaoFornecedor: FinanceiroCotacaoFornecedor
  itens: FinanceiroCotacaoItem[]
  precosExistentes: FinanceiroCotacaoPreco[]
  onClose: () => void
  onResolvido: () => void
}

interface LinhaResposta {
  // O que o usuário digita — no mesmo formato que o fornecedor cotou de
  // volta. Por unidade_fornecedor quando o item tem uma cadastrada (ex:
  // "R$ por pacote"), senão por unidade_cotacao (comportamento de sempre).
  valorDigitado: string
  valorTotal: string
  valorTotalEditado: boolean
  disponivel: boolean
  // Override opcional de fator_conversao — só preenchido quando a embalagem
  // DESSE fornecedor difere do padrão cadastrado na matéria-prima (ex: a
  // caixa dele tem 100 un em vez das 300 do cadastro). Vazio = usa o padrão.
  fatorConversaoDigitado: string
}

// unidade_compra por 1 unidade_fornecedor (ex: 1 pacote = 5kg -> 5). Sem
// isso cadastrado no item, não há conversão — valorDigitado já É o valor
// por unidade_cotacao, igual ao comportamento anterior.
function fatorFornecedor(item: FinanceiroCotacaoItem): number | undefined {
  return item.materia_prima?.unidade_fornecedor ? item.materia_prima.fator_unidade_fornecedor : undefined
}

export default function ResponderCotacaoModal({ cotacaoFornecedor, itens, precosExistentes, onClose, onResolvido }: Props) {
  const [linhas, setLinhas] = useState<Record<string, LinhaResposta>>(() => {
    const inicial: Record<string, LinhaResposta> = {}
    for (const item of itens) {
      const existente = precosExistentes.find((p) => p.cotacao_item_id === item.id)
      const fator = fatorFornecedor(item)
      // valor_unitario salvo é sempre por unidade_compra — pra reabrir e
      // mostrar de novo no formato do fornecedor (por pacote), multiplica
      // pelo fator (inverso do que confirmar() faz ao salvar).
      const valorDigitado =
        existente?.valor_unitario != null
          ? String(fator ? existente.valor_unitario * fator : existente.valor_unitario)
          : ''
      inicial[item.id] = {
        valorDigitado,
        valorTotal: existente?.valor_total != null ? String(existente.valor_total) : '',
        // Só trava o auto-cálculo (ver atualizarLinha) quando já existe uma
        // resposta salva sendo reaberta pra edição — numa resposta nova,
        // valor total deve seguir calculando sozinho a partir do unitário.
        valorTotalEditado: existente?.valor_total != null,
        disponivel: existente?.disponivel ?? true,
        fatorConversaoDigitado: existente?.fator_conversao_fornecedor != null ? String(existente.fator_conversao_fornecedor) : '',
      }
    }
    return inicial
  })
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  function atualizarLinha(itemId: string, patch: Partial<LinhaResposta>) {
    setLinhas((prev) => {
      const atual = prev[itemId]
      const nova = { ...atual, ...patch }
      if (patch.valorDigitado !== undefined && !atual.valorTotalEditado) {
        const item = itens.find((i) => i.id === itemId)
        const qtd = item?.quantidade || 0
        const fator = item ? fatorFornecedor(item) : undefined
        const digitado = Number(patch.valorDigitado)
        const valorUnitario = fator ? digitado / fator : digitado
        if (qtd > 0 && valorUnitario > 0) nova.valorTotal = (qtd * valorUnitario).toFixed(2)
      }
      return { ...prev, [itemId]: nova }
    })
  }

  const todasValidas = itens.every((item) => {
    const l = linhas[item.id]
    if (!l) return false
    if (!l.disponivel) return true
    return Number(l.valorDigitado) > 0 && Number(l.valorTotal) > 0
  })

  async function confirmar() {
    if (!todasValidas) {
      setErro('Preencha o preço de todos os itens, ou marque como indisponível.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      const precos: RespostaItemCotacao[] = itens.map((item) => {
        const l = linhas[item.id]
        const fator = fatorFornecedor(item)
        const digitado = Number(l.valorDigitado)
        const valorUnitario = fator ? digitado / fator : digitado
        return {
          cotacao_item_id: item.id,
          valor_unitario: l.disponivel ? valorUnitario : null,
          valor_total: l.disponivel ? Number(l.valorTotal) : null,
          disponivel: l.disponivel,
          fator_conversao_fornecedor: l.disponivel && l.fatorConversaoDigitado ? Number(l.fatorConversaoDigitado) : null,
        }
      })
      await responderCotacaoFornecedor(cotacaoFornecedor.id, precos)
      onResolvido()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{cotacaoFornecedor.parte?.nome}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          {itens.map((item) => {
            const l = linhas[item.id]
            if (!l) return null
            const fator = fatorFornecedor(item)
            const unidadePreco = item.materia_prima?.unidade_fornecedor || item.unidade_cotacao
            // Conversão pra unidade primária (unidade_medida) — a mesma
            // embalagem ("cx") pode ter quantidades bem diferentes de
            // fornecedor pra fornecedor (ex: 300 un x 100 un), então o
            // padrão do cadastro só serve de sugestão; cada resposta pode
            // sobrescrever com o valor real informado por ESSE fornecedor.
            const unidadeMedida = item.materia_prima?.unidade_medida
            const mostraConversao = unidadeMedida && unidadeMedida !== item.unidade_cotacao
            const fatorConversaoEfetivo = l.fatorConversaoDigitado ? Number(l.fatorConversaoDigitado) : item.materia_prima?.fator_conversao
            const valorPorUnidadeCotacao = fator ? Number(l.valorDigitado) / fator : Number(l.valorDigitado)
            return (
              <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-800">
                    {item.materia_prima?.nome} <span className="font-normal text-gray-500">· {item.quantidade} {item.unidade_cotacao}</span>
                  </p>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={!l.disponivel}
                      onChange={(e) => atualizarLinha(item.id, { disponivel: !e.target.checked })}
                      className="w-3.5 h-3.5 rounded"
                    />
                    Não tem esse item
                  </label>
                </div>
                {l.disponivel && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Valor por {unidadePreco} (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.valorDigitado}
                        onChange={(e) => atualizarLinha(item.id, { valorDigitado: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      {fator && Number(l.valorDigitado) > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          ≈ {formatBRL(Number(l.valorDigitado) / fator)}/{item.unidade_cotacao}
                        </p>
                      )}
                      {mostraConversao && fatorConversaoEfetivo && fatorConversaoEfetivo > 0 && valorPorUnidadeCotacao > 0 && (
                        <p className="text-[11px] text-blue-600 mt-1">
                          ≈ {formatBRL(valorPorUnidadeCotacao / fatorConversaoEfetivo)}/{unidadeMedida}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Valor total (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={l.valorTotal}
                        onChange={(e) => atualizarLinha(item.id, { valorTotal: e.target.value, valorTotalEditado: true })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    {mostraConversao && (
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">
                          Quantas {unidadeMedida} vêm em 1 {item.unidade_cotacao}? <span className="text-gray-400">(opcional)</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={l.fatorConversaoDigitado}
                          onChange={(e) => atualizarLinha(item.id, { fatorConversaoDigitado: e.target.value })}
                          placeholder={item.materia_prima?.fator_conversao != null ? `padrão do cadastro: ${item.materia_prima.fator_conversao}` : ''}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Só preencha se a embalagem desse fornecedor for diferente do cadastro (ex: caixa com menos unidades).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={confirmar}
          disabled={processando || !todasValidas}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
        >
          {processando ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />} Salvar preços
        </button>
      </div>
    </div>
  )
}
