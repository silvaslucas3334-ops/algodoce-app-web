'use client'
import { useEffect, useRef } from 'react'
import { DreLinhaDetalhe, DreReceitaDetalhe } from '@/lib/financeiro-dre'
import { formatBRL } from '@/lib/ofx'
import { X } from 'lucide-react'
import { useEscapeKey } from '@/hooks/useEscapeKey'

interface Props {
  tipo: 'despesa' | 'insumo' | 'receita'
  titulo: string
  linhas?: DreLinhaDetalhe[]
  receitas?: DreReceitaDetalhe[]
  onClose: () => void
}

// Painel lateral (desliza da direita) com o que compõe uma conta do DRE — mantém a cascata visível ao lado.
// Despesa e insumo comprado sempre têm beneficiário/fornecedor — agrupa por parte, com a proporção de cada um.
// Receita não tem beneficiário no schema (só categoria), então vira uma lista das entradas individuais,
// já mostrando bruto x líquido quando a taxa foi informada.
export default function DreDetalheModal({ tipo, titulo, linhas, receitas, onClose }: Props) {
  useEscapeKey(onClose)
  const fechar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fechar.current?.focus()
  }, [])

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
  const totalPartes = porParte.reduce((s, p) => s + p.valor, 0)
  const maiorParte = porParte[0]?.valor || 0

  const receitasOrdenadas = tipo === 'receita' ? (receitas || []).slice().sort((a, b) => b.data.localeCompare(a.data)) : []
  const totalReceitas = receitasOrdenadas.reduce((s, r) => s + r.valor, 0)

  return (
    <div
      className="fixed inset-0 bg-black/40 flex justify-end z-50"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white shadow-2xl w-full sm:max-w-md lg:max-w-lg h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-800 leading-tight">{titulo}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Total <span className="font-semibold text-gray-800 tabular-nums">{formatBRL(tipo === 'receita' ? totalReceitas : totalPartes)}</span>
              <span className="text-gray-400">
                {' '}
                · {tipo === 'receita' ? `${receitasOrdenadas.length} entrada(s)` : `${porParte.length} ${tipo === 'insumo' ? 'fornecedor(es)' : 'beneficiário(s)'}`}
              </span>
            </p>
          </div>
          <button ref={fechar} onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={24} />
          </button>
        </div>

        <div className="px-5 py-4">
          {tipo !== 'receita' ? (
            porParte.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nada neste grupo no período.</p>
            ) : (
              <ul className="space-y-3">
                {porParte.map((b) => (
                  <li key={b.parteId}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-800 truncate">{b.parteNome}</span>
                      <span className="font-semibold text-gray-800 tabular-nums whitespace-nowrap">{formatBRL(b.valor)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                      <div className="h-full rounded-full bg-pink-500" style={{ width: `${maiorParte > 0 ? (b.valor / maiorParte) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {b.quantidade} lançamento(s)
                      {totalPartes > 0 ? ` · ${((b.valor / totalPartes) * 100).toFixed(1).replace('.', ',')}% do total` : ''}
                    </p>
                  </li>
                ))}
              </ul>
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
                  <p className="font-semibold text-gray-800 tabular-nums">{formatBRL(r.valor)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
