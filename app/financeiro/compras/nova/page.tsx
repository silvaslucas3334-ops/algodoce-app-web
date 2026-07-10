'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import SelecionarMateriaPrimaModal, { ItemNota } from '@/components/SelecionarMateriaPrimaModal'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { FinanceiroParte, FinanceiroMateriaPrima, UnidadeFinanceiro, FormaPagamento, CondicaoPagamento } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { calcularVencimento, formatarDocumento, hojeISO, somarMeses } from '@/lib/financeiro-utils'

export default function LancarNotaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])

  // Cozinha não é uma entidade própria — seus custos entram como rateio (0001).
  const unidadeTravada: UnidadeFinanceiro | null =
    usuario?.role === 'cozinha' ? 'rateio' : usuario?.role === 'loja' ? usuario?.loja_id : null

  // Dados da nota
  const [fornecedorId, setFornecedorId] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [dataCompra, setDataCompra] = useState(hojeISO())
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>(unidadeTravada || 'loja1')

  // Itens
  const [itens, setItens] = useState<ItemNota[]>([])
  const [modalAberto, setModalAberto] = useState(false)

  // Pagamento (pré-preenchido pelo cadastro do fornecedor, editável)
  const [jaPago, setJaPago] = useState(false)
  const [dataPagamento, setDataPagamento] = useState(hojeISO())
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [condicao, setCondicao] = useState<CondicaoPagamento>('a_vista')
  const [dataVencimento, setDataVencimento] = useState(hojeISO())
  const [parcelas, setParcelas] = useState(1)

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
    supabase
      .from('financeiro_partes')
      .select('*')
      .eq('papel_fornecedor', true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setFornecedores(data || []))
  }, [])

  const fornecedor = fornecedores.find((f) => f.id === fornecedorId)

  // Ao escolher o fornecedor, herda forma/condição do cadastro e calcula o
  // vencimento pela condição (à vista = data da compra; a prazo = + prazo).
  useEffect(() => {
    if (!fornecedor) return
    setFormaPagamento(fornecedor.forma_pagamento_padrao || '')
    setCondicao(fornecedor.condicao_pagamento)
    setDataVencimento(calcularVencimento(dataCompra, fornecedor.condicao_pagamento, fornecedor.prazo_dias))
  }, [fornecedorId])

  // Recalcula o vencimento quando a data da compra ou a condição mudam.
  useEffect(() => {
    setDataVencimento(calcularVencimento(dataCompra, condicao, fornecedor?.prazo_dias))
  }, [dataCompra, condicao])

  const totalNota = itens.reduce((acc, i) => acc + i.valor_total, 0)
  const podeSalvar = fornecedorId && dataCompra && itens.length > 0 && totalNota > 0 && (!jaPago ? dataVencimento : dataPagamento)

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  async function salvar() {
    if (!podeSalvar || !usuario || !fornecedor) {
      setErro('Preencha fornecedor, data e adicione pelo menos um item.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const descricaoBase = numeroNota.trim()
        ? `NF ${numeroNota.trim()} — ${fornecedor.nome}`
        : `Compra — ${fornecedor.nome}`

      const nParcelas = jaPago ? 1 : parcelas
      const grupo = nParcelas > 1 ? crypto.randomUUID() : null
      // Divide em centavos exatos: última parcela absorve a diferença de arredondamento.
      const valorParcela = Math.round((totalNota / nParcelas) * 100) / 100
      const valorUltima = Math.round((totalNota - valorParcela * (nParcelas - 1)) * 100) / 100

      const linhas = Array.from({ length: nParcelas }, (_, i) => ({
        tipo: 'compra_insumos',
        parte_id: fornecedorId,
        descricao: nParcelas > 1 ? `${descricaoBase} (${i + 1}/${nParcelas})` : descricaoBase,
        valor_total: i === nParcelas - 1 ? valorUltima : valorParcela,
        numero_documento: numeroNota.trim() || null,
        data_lancamento: dataCompra,
        data_vencimento: i === 0 ? dataVencimento : somarMeses(dataVencimento, i),
        data_pagamento: jaPago ? dataPagamento : null,
        status: jaPago ? 'pago' : 'aberto',
        forma_pagamento: formaPagamento || null,
        condicao_pagamento: condicao,
        parcela_num: nParcelas > 1 ? i + 1 : null,
        parcela_total: nParcelas > 1 ? nParcelas : null,
        grupo_parcelamento: grupo,
        unidade,
        conta_id: null, // na nota, a conta é por item
        criado_por: usuario.id,
      }))

      const { data: criados, error } = await supabase.from('financeiro_lancamentos').insert(linhas).select('id, parcela_num')
      if (error) throw error

      // Itens ficam na parcela 1 (ou no lançamento único): o custo/CMV usa a
      // data da compra; só o pagamento se divide entre as parcelas.
      const primeiro = nParcelas > 1 ? criados?.find((c: any) => c.parcela_num === 1) : criados?.[0]
      if (!primeiro) throw new Error('Lançamento criado mas não retornado')

      const linhasItens = itens.map((item) => ({
        lancamento_id: primeiro.id,
        materia_prima_id: item.materia_prima_id,
        quantidade: item.quantidade,
        unidade_nota: item.unidade_nota,
        fator_conversao: item.fator_conversao,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        conta_id: item.conta_id,
      }))
      const { error: erroItens } = await supabase.from('financeiro_lancamento_itens').insert(linhasItens)
      if (erroItens) throw erroItens

      router.push('/financeiro/despesas')
    } catch (err: any) {
      console.error('Erro ao lançar nota:', err)
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
            <div>
              <h1 className="text-xl font-bold text-gray-800">Lançar Nota de Insumos</h1>
              <p className="text-xs text-gray-500">A nota gera automaticamente a despesa correspondente</p>
            </div>
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

            {fornecedor && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-0.5">
                <p><strong>{fornecedor.nome}</strong> · {formatarDocumento(fornecedor.documento)}</p>
                <p>
                  Pagamento usual: {fornecedor.forma_pagamento_padrao ? FORMA_PAGAMENTO_LABEL[fornecedor.forma_pagamento_padrao] : 'não definido'} ·{' '}
                  {fornecedor.condicao_pagamento === 'a_prazo' ? `a prazo (${fornecedor.prazo_dias} dias)` : 'à vista'}
                </p>
              </div>
            )}

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
                  {(['loja1', 'loja2', 'rateio'] as UnidadeFinanceiro[]).map((u) => (
                    <option key={u} value={u}>{UNIDADE_LABEL[u]}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Itens da nota */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Itens da nota</h2>
              <button
                onClick={() => setModalAberto(true)}
                className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
              >
                <Plus size={16} /> Adicionar item
              </button>
            </div>

            {itens.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">
                Nenhum item ainda — clique em "Adicionar item" para pesquisar no cadastro de matérias-primas.
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{item.materia_prima_nome}</p>
                      <p className="text-xs text-gray-500">
                        {item.quantidade} {item.unidade_nota} × {formatBRL(item.valor_unitario)}
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
          </div>

          {/* Pagamento */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Pagamento</h2>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setJaPago(false)}
                className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold ${
                  !jaPago ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                A pagar
              </button>
              <button
                type="button"
                onClick={() => setJaPago(true)}
                className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold ${
                  jaPago ? 'border-green-600 bg-green-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                }`}
              >
                Já foi paga
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Forma de pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento | '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                >
                  <option value="">Não definida</option>
                  {Object.entries(FORMA_PAGAMENTO_LABEL).map(([valor, label]) => (
                    <option key={valor} value={valor}>{label}</option>
                  ))}
                </select>
              </div>
              {jaPago ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pago em</label>
                  <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Condição</label>
                  <select
                    value={condicao}
                    onChange={(e) => setCondicao(e.target.value as CondicaoPagamento)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                  >
                    <option value="a_vista">À vista</option>
                    <option value="a_prazo">A prazo</option>
                  </select>
                </div>
              )}
            </div>

            {!jaPago && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Vencimento</label>
                  <input type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Preenchido pela condição do fornecedor — ajuste se o boleto vier diferente.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Parcelas</label>
                  <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'À vista (1x)' : `${n}x de ${totalNota > 0 ? formatBRL(totalNota / n) : '—'}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button onClick={salvar} disabled={salvando || !podeSalvar} className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {salvando ? 'Salvando...' : `Lançar nota${itens.length > 0 ? ` (${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · ${formatBRL(totalNota)})` : ''}`}
          </button>
        </div>

        {modalAberto && (
          <SelecionarMateriaPrimaModal
            materias={materias}
            onAdd={(item) => setItens((prev) => [...prev, item])}
            onClose={() => setModalAberto(false)}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
