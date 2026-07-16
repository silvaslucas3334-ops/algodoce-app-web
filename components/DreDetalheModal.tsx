'use client'
import { DreLinhaDetalhe, DreReceitaDetalhe } from '@/lib/financeiro-dre'
import { formatBRL } from '@/lib/ofx'
import { X } from 'lucide-react'

interface Props {
  tipo: 'despesa' | 'insumo' | 'receita'
  titulo: string
  linhas?: DreLinhaDetalhe[]
  receitas?: DreReceitaDetalhe[]
  onClose: () => void
}

// Despesa e insumo comprado sempre têm beneficiário/fornecedor — agrupa por
// parte, igual ao FluxoCaixaDetalheModal. Receita não tem beneficiário no
// schema (só categoria), então vira uma lista das entradas individuais,
// já mostrando bruto x líquido quando a taxa foi informada.
export default function DreDetalheModal({ tipo, titulo, linhas, receitas, onClose }: Props) {
  const porParte =
    tipo !== 'receita'
      ? Array.from(
          (linhas || []).reduce((mapa, l) => {
            const atual = mapa.get(l.parteId) || { parteNome: l.parteNome, valor: 0, quantidade: 0 }
            atual.valor += l.valor
            atual.quantidade += 1
            mapa.set(l.parteId, atual)
            return mapa
          }, new Map<string, { parteNome: string; valor: number; quantidade: number }>())
        )
          .map(([parteId, v]) => ({ parteId, ...v }))
          .sort((a, b) => b.valor - a.valor)
      : []

  const receitasOrdenadas = tipo === 'receita' ? (receitas || []).slice().sort((a, b) => b.data.localeCompare(a.data)) : []

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">{titulo}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {tipo !== 'receita' ? (
          porParte.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Nada neste grupo no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-3">{tipo === 'insumo' ? 'Fornecedor' : 'Beneficiário'}</th>
                    <th className="py-2 pr-3">Nº lançamentos</th>
                    <th className="py-2 pr-3">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {porParte.map((b) => (
                    <tr key={b.parteId} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-medium text-gray-800">{b.parteNome}</td>
                      <td className="py-2 pr-3 text-gray-600">{b.quantidade}</td>
                      <td className="py-2 pr-3 font-semibold text-gray-800">{formatBRL(b.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : receitasOrdenadas.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Nenhuma receita nesta categoria no período.</p>
        ) : (
          <div className="space-y-2">
            {receitasOrdenadas.map((r, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                <div>
                  <p className="text-gray-800">{new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                  {r.observacao && <p className="text-xs text-gray-500 mt-0.5">{r.observacao}</p>}
                  {r.valorBruto != null && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Bruto {formatBRL(r.valorBruto)} · taxa {formatBRL(r.valorBruto - r.valor)}
                    </p>
                  )}
                </div>
                <p className="font-semibold text-gray-800">{formatBRL(r.valor)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
