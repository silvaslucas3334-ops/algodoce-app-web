'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import EmptyState from '@/components/EmptyState'
import FornecedorCombobox from '@/components/FornecedorCombobox'
import { FinanceiroMateriaPrima } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import {
  agruparCustoPorFornecedor,
  buscarCustoPorFornecedorCompleto,
  itensDoFornecedor,
  ItemDoFornecedor,
  MelhorCompraGrupo,
  resumirFornecedores,
} from '@/lib/financeiro-melhor-compra'

interface Props {
  visao: 'insumo' | 'fornecedor'
  fornecedorId: string
  onVisao: (v: 'insumo' | 'fornecedor') => void
  onFornecedor: (id: string) => void
}

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/**
 * Melhor compra — mesmos dados de sempre (custo médio por fornecedor, todo o histórico
 * registrado, sem filtro de período). Duas leituras: por insumo (quem vende mais barato
 * cada item) e por fornecedor (em quais itens ESTE fornecedor é o mais barato).
 */
export default function ComprasMelhorCompra({ visao, fornecedorId, onVisao, onFornecedor }: Props) {
  const [grupos, setGrupos] = useState<MelhorCompraGrupo[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [mostrarOutros, setMostrarOutros] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setLoading(true)
      setErro('')
      try {
        const [custos, { data: materias, error }] = await Promise.all([
          buscarCustoPorFornecedorCompleto(),
          supabase.from('financeiro_materias_primas').select('id, nome, unidade_medida, unidade_compra, fator_conversao').eq('ativo', true).range(0, 4999),
        ])
        if (error) throw error
        if (!cancelado) setGrupos(agruparCustoPorFornecedor(custos, (materias || []) as FinanceiroMateriaPrima[]))
      } catch (e: any) {
        if (!cancelado) setErro('Erro ao carregar: ' + (e?.message || 'desconhecido'))
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    carregar()
    return () => { cancelado = true }
  }, [])

  const resumo = useMemo(() => resumirFornecedores(grupos), [grupos])
  const opcoesFornecedor = useMemo(() => resumo.map((f) => ({ id: f.parte_id, nome: f.fornecedor_nome })).sort((a, b) => a.nome.localeCompare(b.nome)), [resumo])
  const doFornecedor = useMemo(() => (fornecedorId ? itensDoFornecedor(grupos, fornecedorId) : null), [grupos, fornecedorId])
  const nomeFornecedor = resumo.find((f) => f.parte_id === fornecedorId)?.fornecedor_nome

  const filtrados = grupos.filter((g) => g.materia_prima_nome.toLowerCase().includes(busca.trim().toLowerCase()))

  const botaoVisao = (chave: 'insumo' | 'fornecedor', rotulo: string) => (
    <button
      onClick={() => onVisao(chave)}
      className={`px-3 py-1.5 rounded-full text-sm border ${visao === chave ? 'bg-pink-100 text-pink-700 border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
    >
      {rotulo}
    </button>
  )

  if (loading) {
    return <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader size={18} className="animate-spin" /> Carregando...</div>
  }
  if (erro) return <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {botaoVisao('insumo', 'Por insumo')}
        {botaoVisao('fornecedor', 'Por fornecedor')}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {visao === 'insumo'
          ? 'Compara, por item, todos os fornecedores que já venderam pra você — o mais barato aparece primeiro.'
          : 'Escolha um fornecedor para ver em quais itens ele tem o melhor preço.'}{' '}
        Sem filtro de período (todo o histórico registrado); o melhor preço só conta quando há 2 ou mais fornecedores.
      </p>

      {grupos.length === 0 ? (
        <EmptyState title="Nada pra comparar ainda" description="Assim que houver compras registradas com matéria-prima e fornecedor, elas aparecem aqui." />
      ) : visao === 'insumo' ? (
        <>
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar item..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>
          {filtrados.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">Nenhum item encontrado.</p>
          ) : (
            <div className="space-y-3">
              {filtrados.map((grupo) => (
                <div key={grupo.materia_prima_id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-gray-800">{grupo.materia_prima_nome}</p>
                    {grupo.fornecedores.length === 1 && <span className="text-xs text-gray-400">Só um fornecedor — nada a comparar ainda</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-200">
                          <th className="py-2 pr-3">Fornecedor</th>
                          <th className="py-2 pr-3">Custo médio/{grupo.unidade_medida}</th>
                          <th className="py-2 pr-3">Preço/{grupo.unidade_compra}</th>
                          <th className="py-2 pr-3">Nº compras</th>
                          <th className="py-2 pr-3">Última compra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.fornecedores.map((f) => (
                          <tr key={f.parte_id} className="border-b border-gray-100">
                            <td className="py-2 pr-3 font-medium text-gray-800">
                              {f.fornecedor_nome}
                              {f.melhorPreco && (
                                <span className="ml-2 text-[10px] font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">Melhor preço</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-gray-800">{formatBRL(f.custo_medio_por_unidade_medida)}</td>
                            <td className="py-2 pr-3 font-medium text-gray-800">{formatBRL(f.custo_medio_por_unidade_medida * grupo.fator_conversao)}</td>
                            <td className="py-2 pr-3 text-gray-600">{f.numero_compras}</td>
                            <td className="py-2 pr-3 text-gray-600">{fmtData(f.ultima_compra)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-4">
            <FornecedorCombobox valorId={fornecedorId} opcoes={opcoesFornecedor} onChange={onFornecedor} placeholder="Escolher fornecedor..." />
          </div>

          {!doFornecedor ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 px-3">Fornecedor</th>
                    <th className="py-2 px-3 text-right">Itens com melhor preço</th>
                    <th className="py-2 px-3 text-right">Itens que já vendeu</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((f) => (
                    <tr key={f.parte_id} onClick={() => onFornecedor(f.parte_id)} className="border-b border-gray-100 cursor-pointer hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-800">{f.fornecedor_nome}</td>
                      <td className="py-2 px-3 text-right">
                        {f.itensComMelhorPreco > 0 ? (
                          <span className="font-semibold text-green-700">{f.itensComMelhorPreco}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-600">{f.itensVendidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="text-base font-bold text-gray-800 mb-1">
                  Itens em que {nomeFornecedor} tem o melhor preço <span className="text-green-700">({doFornecedor.melhores.length})</span>
                </h3>
                {doFornecedor.melhores.length === 0 ? (
                  <p className="text-sm text-gray-500">Este fornecedor não é o mais barato em nenhum item com 2 ou mais fornecedores.</p>
                ) : (
                  <TabelaItens itens={doFornecedor.melhores} modo="melhor" />
                )}
              </section>

              {doFornecedor.outros.length > 0 && (
                <section>
                  <button onClick={() => setMostrarOutros((v) => !v)} className="text-sm font-semibold text-gray-700 hover:underline">
                    {mostrarOutros ? '▼' : '▶'} Outros itens que {nomeFornecedor} já vendeu e que estão mais caros ({doFornecedor.outros.length})
                  </button>
                  {mostrarOutros && (
                    <div className="mt-2">
                      <TabelaItens itens={doFornecedor.outros} modo="outros" />
                    </div>
                  )}
                </section>
              )}

              {doFornecedor.unicos.length > 0 && (
                <p className="text-xs text-gray-400">
                  Mais {doFornecedor.unicos.length} item(ns) em que este é o único fornecedor registrado (sem comparação possível).
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TabelaItens({ itens, modo }: { itens: ItemDoFornecedor[]; modo: 'melhor' | 'outros' }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="py-2 px-3">Item</th>
            <th className="py-2 px-3 text-right">Custo médio</th>
            <th className="py-2 px-3 text-right">Preço/unid. compra</th>
            <th className="py-2 px-3 text-right">Nº compras</th>
            <th className="py-2 px-3">Última compra</th>
            <th className="py-2 px-3">{modo === 'melhor' ? '2º melhor preço' : 'Melhor preço está em'}</th>
            <th className="py-2 px-3 text-right">{modo === 'melhor' ? '2º custa mais' : 'Este custa mais'}</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => {
            const referencia = modo === 'melhor' ? i.proximo : i.melhor
            return (
              <tr key={i.materia_prima_id} className="border-b border-gray-100">
                <td className="py-2 px-3 font-medium text-gray-800">{i.materia_prima_nome}</td>
                <td className="py-2 px-3 text-right text-gray-800 whitespace-nowrap">
                  {formatBRL(i.deste.custo_medio_por_unidade_medida)}<span className="text-xs text-gray-400">/{i.unidade_medida}</span>
                </td>
                <td className="py-2 px-3 text-right font-medium text-gray-900 whitespace-nowrap">
                  {formatBRL(i.deste.custo_medio_por_unidade_medida * i.fator_conversao)}<span className="text-xs text-gray-400">/{i.unidade_compra}</span>
                </td>
                <td className="py-2 px-3 text-right text-gray-600">{i.deste.numero_compras}</td>
                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{fmtData(i.deste.ultima_compra)}</td>
                <td className="py-2 px-3 text-gray-600">
                  {referencia ? (
                    <>
                      {referencia.fornecedor_nome}
                      <span className="block text-xs text-gray-400">{formatBRL(referencia.custo_medio_por_unidade_medida * i.fator_conversao)}/{i.unidade_compra}</span>
                    </>
                  ) : '—'}
                </td>
                <td className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${modo === 'melhor' ? 'text-green-700' : 'text-red-600'}`}>
                  {i.diferencaPct != null ? fmtPct(i.diferencaPct) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
