'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FinanceiroParte, FinanceiroMateriaPrima, UnidadeFinanceiro } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'

interface ItemNota {
  materia_prima_id: string
  materia_prima_nome: string
  unidade_compra: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  // Herdada do cadastro da matéria-prima no momento da adição — uma NF pode
  // misturar contas (ex: leite → 1001 Matéria-Prima, caixa → 1002 Embalagem).
  conta_id: string | null
  conta_label: string | null
}

export default function NovaCompraInsumoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])

  const unidadeTravada: UnidadeFinanceiro | null =
    usuario?.role === 'cozinha' ? 'cozinha' : usuario?.role === 'loja' ? usuario?.loja_id : null

  // Dados da nota (compartilhados por todos os itens). A conta contábil NÃO
  // fica aqui: é por item, herdada do cadastro da matéria-prima.
  const [fornecedorId, setFornecedorId] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [dataCompra, setDataCompra] = useState(new Date().toISOString().split('T')[0])
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>(unidadeTravada || 'cozinha')

  // Itens adicionados à nota
  const [itens, setItens] = useState<ItemNota[]>([])

  // Item em edição
  const [materiaPrimaId, setMateriaPrimaId] = useState('')
  const [quantidade, setQuantidade] = useState('')
  const [valorUnitario, setValorUnitario] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [valorTotalEditadoManualmente, setValorTotalEditadoManualmente] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (unidadeTravada) setUnidade(unidadeTravada)
  }, [unidadeTravada])

  useEffect(() => {
    supabase
      .from('financeiro_materias_primas')
      .select('*, conta:financeiro_contas(codigo, nome)')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setMaterias(data || []))
    supabase.from('financeiro_partes').select('*').eq('papel_fornecedor', true).eq('ativo', true).order('nome').then(({ data }) => setFornecedores(data || []))
  }, [])

  useEffect(() => {
    if (!valorTotalEditadoManualmente && quantidade && valorUnitario) {
      setValorTotal((Number(quantidade) * Number(valorUnitario)).toFixed(2))
    }
  }, [quantidade, valorUnitario, valorTotalEditadoManualmente])

  const materiaSelecionada = materias.find((m) => m.id === materiaPrimaId)
  const itemValido = materiaPrimaId && Number(quantidade) > 0 && Number(valorTotal) >= 0
  const totalNota = itens.reduce((acc, i) => acc + i.valor_total, 0)
  const podeSalvar = fornecedorId && dataCompra && itens.length > 0

  function adicionarItem() {
    if (!itemValido || !materiaSelecionada) return
    setItens((prev) => [
      ...prev,
      {
        materia_prima_id: materiaPrimaId,
        materia_prima_nome: materiaSelecionada.nome,
        unidade_compra: materiaSelecionada.unidade_compra,
        quantidade: Number(quantidade),
        valor_unitario: Number(valorUnitario) || 0,
        valor_total: Number(valorTotal),
        conta_id: materiaSelecionada.conta_id || null,
        conta_label: materiaSelecionada.conta
          ? `${materiaSelecionada.conta.codigo} — ${materiaSelecionada.conta.nome}`
          : null,
      },
    ])
    setMateriaPrimaId('')
    setQuantidade('')
    setValorUnitario('')
    setValorTotal('')
    setValorTotalEditadoManualmente(false)
  }

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha fornecedor, data e adicione pelo menos um item.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const linhas = itens.map((item) => ({
        materia_prima_id: item.materia_prima_id,
        fornecedor_id: fornecedorId,
        numero_nota_fiscal: numeroNota.trim() || null,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        data_compra: dataCompra,
        unidade,
        conta_id: item.conta_id,
        status: 'aberto',
        criado_por: usuario.id,
      }))
      const { error } = await supabase.from('financeiro_compras_insumos').insert(linhas)
      if (error) throw error
      router.push('/financeiro/compras')
    } catch (err: any) {
      console.error('Erro ao salvar compra:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Nova Compra de Insumo</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {/* Dados da nota */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados da nota</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fornecedor</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
              {fornecedores.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum fornecedor cadastrado — peça ao admin para cadastrar antes de lançar.</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Data da compra</label>
                <input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nº nota fiscal</label>
                <input type="text" value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Unidade</label>
              {unidadeTravada ? (
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-medium">
                  {UNIDADE_LABEL[unidadeTravada]}
                </div>
              ) : (
                <select value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeFinanceiro)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                  {(['cozinha', 'loja1', 'loja2', 'rateio'] as UnidadeFinanceiro[]).map((u) => (
                    <option key={u} value={u}>{UNIDADE_LABEL[u]}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Itens da nota */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Itens da nota</h2>

            {itens.length > 0 && (
              <div className="space-y-2">
                {itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{item.materia_prima_nome}</p>
                      <p className="text-xs text-gray-500">
                        {item.quantidade} {item.unidade_compra} × {formatBRL(item.valor_unitario)}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${item.conta_label ? 'text-blue-600' : 'text-amber-600'}`}>
                        {item.conta_label || 'Sem conta no cadastro — admin classifica depois'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-gray-800">{formatBRL(item.valor_total)}</p>
                      <button onClick={() => removerItem(i)} className="text-red-600 hover:text-red-700">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 pt-2 border-t border-gray-200 text-sm">
                  <span className="font-semibold text-gray-700">Total da nota ({itens.length} {itens.length === 1 ? 'item' : 'itens'})</span>
                  <span className="font-bold text-gray-900">{formatBRL(totalNota)}</span>
                </div>
              </div>
            )}

            <div className="p-4 bg-pink-50 rounded-lg border border-pink-200 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Matéria-prima</label>
                <select value={materiaPrimaId} onChange={(e) => setMateriaPrimaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                  <option value="">Selecione...</option>
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
                {materias.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhuma matéria-prima cadastrada — peça ao admin para cadastrar antes de lançar.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantidade {materiaSelecionada && `(${materiaSelecionada.unidade_compra})`}
                  </label>
                  <input type="number" step="any" min={0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Valor unitário (R$)</label>
                  <input type="number" step="0.01" min={0} value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor total do item (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={valorTotal}
                  onChange={(e) => {
                    setValorTotal(e.target.value)
                    setValorTotalEditadoManualmente(true)
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Calculado automaticamente — ajuste para bater com o "custo total" impresso na nota (impostos inclusos).</p>
              </div>

              <button
                onClick={adicionarItem}
                disabled={!itemValido}
                className="w-full bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Adicionar item
              </button>
            </div>
          </div>

          <button onClick={salvar} disabled={salvando || !podeSalvar} className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {salvando ? 'Salvando...' : itens.length > 1 ? `Salvar nota (${itens.length} itens · ${formatBRL(totalNota)})` : 'Salvar'}
          </button>
        </div>
      </div>
    </ProtectedRoute>
  )
}
