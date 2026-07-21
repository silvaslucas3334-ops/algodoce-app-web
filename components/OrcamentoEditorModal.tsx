'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatBRL } from '@/lib/ofx'
import { UNIDADE_LABEL } from '@/lib/constants'
import { FinanceiroParte, FinanceiroConta } from '@/lib/types'
import { buscarOrcamento, salvarOrcamento, salvarItensOrcamento, buscarRecorrenciasAtivas, ItemOrcamentoPayload } from '@/lib/financeiro-orcamento'
import { X, Plus, Trash2 } from 'lucide-react'

interface Props {
  ano: number
  mes: number
  usuarioId: string
  onClose: () => void
  onSalvo: () => void
}

interface ItemForm {
  tipo: 'despesa' | 'compra_insumos'
  id: string // parte_id ou conta_id
  nome: string
  valor_previsto: number
}

export default function OrcamentoEditorModal({ ano, mes, usuarioId, onClose, onSalvo }: Props) {
  const [metaVenda, setMetaVenda] = useState<{ loja1: string; loja2: string }>({ loja1: '', loja2: '' })
  const [saldoInicial, setSaldoInicial] = useState<{ loja1: string; loja2: string }>({ loja1: '', loja2: '' })
  const [itens, setItens] = useState<ItemForm[]>([])
  const [recorrencias, setRecorrencias] = useState<{ nome: string; valor: number; diaVencimento: number }[]>([])

  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [novoModo, setNovoModo] = useState<'despesa' | 'compra_insumos'>('despesa')
  const [novoId, setNovoId] = useState('')
  const [novoValor, setNovoValor] = useState('')

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.from('financeiro_partes').select('*').eq('papel_fornecedor', true).eq('ativo', true).order('nome').then(({ data }) => setFornecedores(data || []))
    supabase.from('financeiro_contas').select('*').eq('ativo', true).order('codigo').then(({ data }) => setContas(data || []))
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    setErro('')
    try {
      const [orcLoja1, orcLoja2, orcGeral, recs] = await Promise.all([
        buscarOrcamento(ano, mes, 'loja1'),
        buscarOrcamento(ano, mes, 'loja2'),
        buscarOrcamento(ano, mes, 'geral'),
        buscarRecorrenciasAtivas(),
      ])
      setMetaVenda({
        loja1: orcLoja1?.valor_meta_venda != null ? String(orcLoja1.valor_meta_venda) : '',
        loja2: orcLoja2?.valor_meta_venda != null ? String(orcLoja2.valor_meta_venda) : '',
      })
      setSaldoInicial({
        loja1: orcLoja1?.saldo_inicial != null ? String(orcLoja1.saldo_inicial) : '',
        loja2: orcLoja2?.saldo_inicial != null ? String(orcLoja2.saldo_inicial) : '',
      })
      setItens(
        (orcGeral?.itens || []).map((i) => ({
          tipo: i.tipo as 'despesa' | 'compra_insumos',
          id: (i.tipo === 'despesa' ? i.conta_id : i.parte_id) || '',
          nome: i.tipo === 'despesa' ? i.conta?.nome || '—' : i.parte?.nome || '—',
          valor_previsto: i.valor_previsto,
        }))
      )
      setRecorrencias((recs || []).map((r) => ({ nome: r.parte?.nome || r.descricao, valor: r.valor, diaVencimento: r.dia_vencimento })))
    } catch (err: any) {
      setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  function adicionarItem() {
    if (!novoId || Number(novoValor) <= 0) return
    const nome =
      novoModo === 'despesa' ? contas.find((c) => c.id === novoId)?.nome : fornecedores.find((f) => f.id === novoId)?.nome
    setItens((prev) => [...prev, { tipo: novoModo, id: novoId, nome: nome || '—', valor_previsto: Number(novoValor) }])
    setNovoId('')
    setNovoValor('')
  }

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  const totalRecorrencias = recorrencias.reduce((s, r) => s + r.valor, 0)
  const totalItens = itens.reduce((s, i) => s + i.valor_previsto, 0)
  const metaTotal =
    metaVenda.loja1 || metaVenda.loja2 ? (Number(metaVenda.loja1) || 0) + (Number(metaVenda.loja2) || 0) : null

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      await salvarOrcamento(
        ano, mes, 'loja1',
        { valor_meta_venda: metaVenda.loja1 ? Number(metaVenda.loja1) : null, saldo_inicial: saldoInicial.loja1 ? Number(saldoInicial.loja1) : null },
        usuarioId
      )
      await salvarOrcamento(
        ano, mes, 'loja2',
        { valor_meta_venda: metaVenda.loja2 ? Number(metaVenda.loja2) : null, saldo_inicial: saldoInicial.loja2 ? Number(saldoInicial.loja2) : null },
        usuarioId
      )
      const geralId = await salvarOrcamento(ano, mes, 'geral', { valor_meta_venda: null, saldo_inicial: null }, usuarioId)
      const payload: ItemOrcamentoPayload[] = itens.map((i) => ({
        tipo: i.tipo,
        parte_id: i.tipo === 'compra_insumos' ? i.id : null,
        conta_id: i.tipo === 'despesa' ? i.id : null,
        valor_previsto: i.valor_previsto,
        observacao: null,
      }))
      await salvarItensOrcamento(geralId, payload)
      onSalvo()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Orçamento do mês</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        {loading ? (
          <p className="text-sm text-gray-400 text-center py-6">Carregando...</p>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Meta de venda por loja{metaTotal != null && <span className="text-gray-500 font-normal"> — total {formatBRL(metaTotal)}</span>}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['loja1', 'loja2'] as const).map((loja) => (
                  <div key={loja} className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500">{UNIDADE_LABEL[loja]}</p>
                    <input
                      type="number" step="0.01" min={0} value={metaVenda[loja]}
                      onChange={(e) => setMetaVenda((prev) => ({ ...prev, [loja]: e.target.value }))}
                      placeholder="Meta de venda (R$)" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                    />
                    <input
                      type="number" step="0.01" value={saldoInicial[loja]}
                      onChange={(e) => setSaldoInicial((prev) => ({ ...prev, [loja]: e.target.value }))}
                      placeholder="Saldo inicial (R$)" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {recorrencias.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Já garantido pela recorrência ({formatBRL(totalRecorrencias)})</p>
                <div className="space-y-1">
                  {recorrencias.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-purple-50 rounded-lg text-xs text-purple-800">
                      <span>{r.nome} (dia {r.diaVencimento})</span>
                      <span className="font-semibold">{formatBRL(r.valor)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Já cadastradas em Despesas — não precisa duplicar aqui.</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Despesas orçadas do mês (consolidado) — {formatBRL(totalItens)}
              </p>
              {itens.length > 0 && (
                <div className="space-y-1 mb-3">
                  {itens.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                      <span className="text-gray-700">{item.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{formatBRL(item.valor_previsto)}</span>
                        <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 border-2 border-dashed border-gray-200 rounded-lg space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setNovoModo('despesa'); setNovoId('') }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${novoModo === 'despesa' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    Despesa (conta)
                  </button>
                  <button
                    type="button"
                    onClick={() => { setNovoModo('compra_insumos'); setNovoId('') }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 ${novoModo === 'compra_insumos' ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'}`}
                  >
                    Fornecedor
                  </button>
                </div>
                <select value={novoId} onChange={(e) => setNovoId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">Selecione...</option>
                  {novoModo === 'despesa'
                    ? contas.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>)
                    : fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number" step="0.01" min={0} value={novoValor} onChange={(e) => setNovoValor(e.target.value)}
                    placeholder="Valor previsto (R$)" className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={adicionarItem}
                    disabled={!novoId || Number(novoValor) <= 0}
                    className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus size={16} /> Adicionar
                  </button>
                </div>
              </div>
            </div>

            <button onClick={salvar} disabled={salvando} className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar orçamento'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
