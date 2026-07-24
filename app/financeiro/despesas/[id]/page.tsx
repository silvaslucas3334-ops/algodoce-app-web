'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, CheckCircle, XCircle, ShoppingCart, ReceiptText, Pencil, Plus, Trash2 } from 'lucide-react'
import { FinanceiroConta, FinanceiroLancamentoItem, FinanceiroParte, FinanceiroMateriaPrima } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL, CONDICAO_PAGAMENTO_LABEL, TIPO_LANCAMENTO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { formatarDocumento, hojeISO, statusExibicao } from '@/lib/financeiro-utils'
import SelecionarMateriaPrimaModal, { ItemNota } from '@/components/SelecionarMateriaPrimaModal'

function itemParaItemNota(item: FinanceiroLancamentoItem): ItemNota {
  return {
    materia_prima_id: item.materia_prima_id,
    materia_prima_nome: item.materia_prima?.nome || '',
    quantidade: item.quantidade,
    unidade_nota: item.unidade_nota,
    fator_conversao: item.fator_conversao,
    valor_unitario: item.valor_unitario,
    valor_total: item.valor_total,
    conta_id: item.conta_id || null,
    conta_label: item.conta ? `${item.conta.codigo} — ${item.conta.nome}` : null,
  }
}

export default function DetalheDespesaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const lancamentoId = params.id as string

  const [lancamento, setLancamento] = useState<any>(null)
  const [itens, setItens] = useState<FinanceiroLancamentoItem[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [partes, setPartes] = useState<FinanceiroParte[]>([])
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')

  // Edição do cabeçalho (campo a campo, admin)
  const [editando, setEditando] = useState(false)
  const [formEdicao, setFormEdicao] = useState<any>(null)

  // Edição/adição de item da nota (admin)
  const [itemEditando, setItemEditando] = useState<FinanceiroLancamentoItem | null>(null)
  const [adicionandoItem, setAdicionandoItem] = useState(false)

  useEffect(() => {
    carregar()
  }, [lancamentoId])

  useEffect(() => {
    if (usuario?.role !== 'admin') return
    supabase
      .from('financeiro_contas')
      .select('*')
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [usuario?.role])

  // Fornecedores/beneficiários pro campo de edição — depende do tipo do lançamento
  useEffect(() => {
    if (usuario?.role !== 'admin' || !lancamento) return
    const campoPapel = lancamento.tipo === 'compra_insumos' ? 'papel_fornecedor' : 'papel_beneficiario'
    supabase
      .from('financeiro_partes')
      .select('*')
      .eq(campoPapel, true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPartes(data || []))
    if (lancamento.tipo === 'compra_insumos') {
      supabase
        .from('financeiro_materias_primas')
        .select('*, conta:financeiro_contas(codigo, nome)')
        .eq('ativo', true)
        .order('nome')
        .then(({ data }) => setMaterias(data || []))
    }
  }, [usuario?.role, lancamento?.tipo])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .select('*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome)')
      .eq('id', lancamentoId)
      .single()
    if (error) console.error('Erro:', error)
    setLancamento(data)

    if (data?.tipo === 'compra_insumos') {
      const { data: itensData } = await supabase
        .from('financeiro_lancamento_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome, unidade_medida), conta:financeiro_contas(codigo, nome)')
        .eq('lancamento_id', lancamentoId)
        .order('created_at')
      setItens(itensData || [])
    }
    setLoading(false)
  }

  const unidadeDoUsuario = usuario?.role === 'cozinha' ? 'rateio' : usuario?.role === 'loja' ? usuario?.loja_id : null
  const podeEditar =
    usuario?.role === 'admin' || (lancamento && lancamento.unidade === unidadeDoUsuario && lancamento.status === 'aberto')
  const ehAdmin = usuario?.role === 'admin'
  // Cancelado é registro congelado — nem admin edita itens dali (só o
  // cabeçalho, pra eventualmente reabrir via "Marcar como Paga"/reversão manual).
  const podeEditarItens = ehAdmin && lancamento?.status !== 'cancelado'

  async function marcarPago() {
    if (!lancamento) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'pago', data_pagamento: hojeISO(), updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao marcar como paga: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function cancelar() {
    if (!lancamento) return
    if (!window.confirm('Cancelar este lançamento?')) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ status: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao cancelar: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function reclassificarConta(novaContaId: string) {
    if (!lancamento) return
    // Na despesa a conta é obrigatória — não permitir voltar para vazio.
    if (lancamento.tipo === 'despesa' && !novaContaId) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_lancamentos')
        .update({ conta_id: novaContaId || null, updated_at: new Date().toISOString() })
        .eq('id', lancamentoId)
      if (error) throw error
      await carregar()
    } catch (err: any) {
      setErro('Erro ao reclassificar: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  function iniciarEdicao() {
    if (!lancamento) return
    setFormEdicao({
      parte_id: lancamento.parte_id,
      numero_documento: lancamento.numero_documento || '',
      data_lancamento: lancamento.data_lancamento,
      data_vencimento: lancamento.data_vencimento,
      data_pagamento: lancamento.data_pagamento || '',
      forma_pagamento: lancamento.forma_pagamento || '',
      condicao_pagamento: lancamento.condicao_pagamento || 'a_vista',
      unidade: lancamento.unidade,
      valor_total: lancamento.valor_total,
    })
    setErro('')
    setEditando(true)
  }

  async function salvarEdicao() {
    if (!lancamento || !formEdicao) return
    if (!formEdicao.parte_id || !formEdicao.data_lancamento || !formEdicao.data_vencimento) {
      setErro('Preencha fornecedor/beneficiário, data de lançamento e vencimento.')
      return
    }
    setProcessando(true)
    setErro('')
    try {
      const payload: any = {
        parte_id: formEdicao.parte_id,
        numero_documento: formEdicao.numero_documento.trim() || null,
        data_lancamento: formEdicao.data_lancamento,
        data_vencimento: formEdicao.data_vencimento,
        data_pagamento: formEdicao.data_pagamento || null,
        forma_pagamento: formEdicao.forma_pagamento || null,
        condicao_pagamento: formEdicao.condicao_pagamento || null,
        unidade: formEdicao.unidade,
        updated_at: new Date().toISOString(),
      }
      // Em compra_insumos o total é sempre a soma dos itens — nunca editável direto aqui.
      if (lancamento.tipo === 'despesa') payload.valor_total = Number(formEdicao.valor_total)

      const { error } = await supabase.from('financeiro_lancamentos').update(payload).eq('id', lancamentoId)
      if (error) throw error
      setEditando(false)
      await carregar()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  // Mantém o cabeçalho da nota = soma dos itens (invariante desde a criação, ver compras/nova)
  async function recalcularTotalItens() {
    const { data } = await supabase
      .from('financeiro_lancamento_itens')
      .select('valor_total')
      .eq('lancamento_id', lancamentoId)
    const soma = (data || []).reduce((acc, i: any) => acc + Number(i.valor_total), 0)
    await supabase
      .from('financeiro_lancamentos')
      .update({ valor_total: soma, updated_at: new Date().toISOString() })
      .eq('id', lancamentoId)
  }

  async function salvarItem(itemNota: ItemNota) {
    setProcessando(true)
    setErro('')
    try {
      if (itemEditando) {
        const { error } = await supabase
          .from('financeiro_lancamento_itens')
          .update({
            materia_prima_id: itemNota.materia_prima_id,
            quantidade: itemNota.quantidade,
            unidade_nota: itemNota.unidade_nota,
            fator_conversao: itemNota.fator_conversao,
            valor_unitario: itemNota.valor_unitario,
            valor_total: itemNota.valor_total,
            conta_id: itemNota.conta_id,
          })
          .eq('id', itemEditando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('financeiro_lancamento_itens').insert({
          lancamento_id: lancamentoId,
          materia_prima_id: itemNota.materia_prima_id,
          quantidade: itemNota.quantidade,
          unidade_nota: itemNota.unidade_nota,
          fator_conversao: itemNota.fator_conversao,
          valor_unitario: itemNota.valor_unitario,
          valor_total: itemNota.valor_total,
          conta_id: itemNota.conta_id,
        })
        if (error) throw error
      }
      await recalcularTotalItens()
      setItemEditando(null)
      setAdicionandoItem(false)
      await carregar()
    } catch (err: any) {
      setErro('Erro ao salvar item: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function removerItem(item: FinanceiroLancamentoItem) {
    if (!window.confirm(`Remover "${item.materia_prima?.nome}" desta nota?`)) return
    setProcessando(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_lancamento_itens').delete().eq('id', item.id)
      if (error) throw error
      await recalcularTotalItens()
      await carregar()
    } catch (err: any) {
      setErro('Erro ao remover item: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!lancamento) {
    return (
      <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Lançamento não encontrado</div>
      </ProtectedRoute>
    )
  }

  const st = statusExibicao(lancamento.status, lancamento.data_vencimento)

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro/despesas')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800">{lancamento.descricao}</h1>
              <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
                {lancamento.tipo === 'compra_insumos' ? <ShoppingCart size={12} /> : <ReceiptText size={12} />}
                {TIPO_LANCAMENTO_LABEL[lancamento.tipo]}
                {lancamento.parcela_num && lancamento.parcela_total && ` · parcela ${lancamento.parcela_num}/${lancamento.parcela_total}`}
              </p>
            </div>
            {ehAdmin && !editando && (
              <button onClick={iniciarEdicao} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500" title="Editar lançamento">
                <Pencil size={18} />
              </button>
            )}
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${st.cor}`}>{st.label}</span>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-3 text-sm">
            {!editando ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Beneficiário</span>
                  <span className="font-medium text-gray-800 text-right">
                    {lancamento.parte?.nome}
                    {lancamento.parte?.documento && (
                      <span className="block text-xs text-gray-400 font-normal">{formatarDocumento(lancamento.parte.documento)}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="font-semibold text-gray-800">{formatBRL(lancamento.valor_total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Data do lançamento</span><span className="text-gray-800">{new Date(lancamento.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Vencimento</span><span className="text-gray-800">{new Date(lancamento.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                {lancamento.data_pagamento && (
                  <div className="flex justify-between"><span className="text-gray-500">Paga em</span><span className="text-gray-800">{new Date(lancamento.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                )}
                {lancamento.forma_pagamento && (
                  <div className="flex justify-between"><span className="text-gray-500">Forma de pagamento</span><span className="text-gray-800">{FORMA_PAGAMENTO_LABEL[lancamento.forma_pagamento]}</span></div>
                )}
                {lancamento.condicao_pagamento && (
                  <div className="flex justify-between"><span className="text-gray-500">Condição</span><span className="text-gray-800">{CONDICAO_PAGAMENTO_LABEL[lancamento.condicao_pagamento]}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Unidade</span><span className="text-gray-800">{UNIDADE_LABEL[lancamento.unidade]}</span></div>
                {lancamento.numero_documento && (
                  <div className="flex justify-between"><span className="text-gray-500">Documento</span><span className="text-gray-800">{lancamento.numero_documento}</span></div>
                )}
                {lancamento.recorrencia_id && (
                  <div className="flex justify-between"><span className="text-gray-500">Origem</span><span className="text-purple-700">🔄 Despesa recorrente</span></div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fornecedor/Beneficiário</label>
                  <select
                    value={formEdicao.parte_id}
                    onChange={(e) => setFormEdicao({ ...formEdicao, parte_id: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    <option value="">Selecione...</option>
                    {partes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Nº documento</label>
                  <input
                    type="text"
                    value={formEdicao.numero_documento}
                    onChange={(e) => setFormEdicao({ ...formEdicao, numero_documento: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                {lancamento.tipo === 'despesa' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Valor</label>
                    <input
                      type="number" step="0.01" min={0}
                      value={formEdicao.valor_total}
                      onChange={(e) => setFormEdicao({ ...formEdicao, valor_total: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Data do lançamento</label>
                    <input
                      type="date"
                      value={formEdicao.data_lancamento}
                      onChange={(e) => setFormEdicao({ ...formEdicao, data_lancamento: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Vencimento</label>
                    <input
                      type="date"
                      value={formEdicao.data_vencimento}
                      onChange={(e) => setFormEdicao({ ...formEdicao, data_vencimento: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Pago em (vazio = ainda não pagou)</label>
                  <input
                    type="date"
                    value={formEdicao.data_pagamento}
                    onChange={(e) => setFormEdicao({ ...formEdicao, data_pagamento: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Forma de pagamento</label>
                    <select
                      value={formEdicao.forma_pagamento}
                      onChange={(e) => setFormEdicao({ ...formEdicao, forma_pagamento: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">Não definida</option>
                      {Object.entries(FORMA_PAGAMENTO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Condição</label>
                    <select
                      value={formEdicao.condicao_pagamento}
                      onChange={(e) => setFormEdicao({ ...formEdicao, condicao_pagamento: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                    >
                      {Object.entries(CONDICAO_PAGAMENTO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unidade</label>
                  <select
                    value={formEdicao.unidade}
                    onChange={(e) => setFormEdicao({ ...formEdicao, unidade: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                  >
                    {(['loja1', 'loja2', 'rateio'] as const).map((u) => <option key={u} value={u}>{UNIDADE_LABEL[u]}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={salvarEdicao}
                    disabled={processando}
                    className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {processando ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setEditando(false)}
                    disabled={processando}
                    className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {lancamento.tipo === 'despesa' && (
              <div className="flex justify-between items-center gap-3 pt-2 border-t border-gray-100">
                <span className="text-gray-500">Conta contábil</span>
                {usuario?.role === 'admin' ? (
                  <select
                    value={lancamento.conta_id || ''}
                    onChange={(e) => reclassificarConta(e.target.value)}
                    disabled={processando}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white max-w-[60%]"
                  >
                    {contas
                      .filter((c) => c.aplicavel_a !== 'compras_insumos')
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                      ))}
                  </select>
                ) : (
                  <span className="text-gray-800">{lancamento.conta ? `${lancamento.conta.codigo} — ${lancamento.conta.nome}` : 'Não classificada'}</span>
                )}
              </div>
            )}
          </div>

          {lancamento.tipo === 'compra_insumos' && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-800">Itens da nota ({itens.length})</h2>
                {podeEditarItens && (
                  <button
                    onClick={() => setAdicionandoItem(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-pink-700 hover:text-pink-800"
                  >
                    <Plus size={14} /> Adicionar item
                  </button>
                )}
              </div>
              {itens.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {lancamento.parcela_num && lancamento.parcela_num > 1
                    ? 'Os itens desta nota ficam registrados na parcela 1.'
                    : 'Nenhum item registrado.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {itens.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div>
                        <p className="font-medium text-gray-800">{item.materia_prima?.nome}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantidade} {item.unidade_nota} × {formatBRL(item.valor_unitario)}
                          {' · '}{formatBRL(item.valor_total / (item.quantidade * item.fator_conversao))}/{item.materia_prima?.unidade_medida}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${item.conta ? 'text-blue-600' : 'text-amber-600'}`}>
                          {item.conta ? `${item.conta.codigo} — ${item.conta.nome}` : 'Sem conta definida'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800">{formatBRL(item.valor_total)}</p>
                        {podeEditarItens && (
                          <>
                            <button onClick={() => setItemEditando(item)} className="text-gray-400 hover:text-gray-700" title="Editar item">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => removerItem(item)} className="text-red-500 hover:text-red-700" title="Remover item">
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {podeEditar && lancamento.status !== 'cancelado' && (
            <div className="flex gap-3">
              <button
                onClick={cancelar}
                disabled={processando}
                className="flex-1 px-4 py-3 border border-red-300 rounded-lg font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle size={18} /> Cancelar
              </button>
              {lancamento.status === 'aberto' && (
                <button
                  onClick={marcarPago}
                  disabled={processando}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} /> {processando ? 'Salvando...' : 'Marcar como Paga'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {itemEditando && (
        <SelecionarMateriaPrimaModal
          materias={materias}
          itemInicial={itemParaItemNota(itemEditando)}
          onAdd={salvarItem}
          onClose={() => setItemEditando(null)}
        />
      )}
      {adicionandoItem && (
        <SelecionarMateriaPrimaModal
          materias={materias}
          onAdd={salvarItem}
          onClose={() => setAdicionandoItem(false)}
        />
      )}
    </ProtectedRoute>
  )
}
