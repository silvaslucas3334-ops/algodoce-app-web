'use client'
import { Suspense, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import NotFoundState from '@/components/NotFoundState'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader, CheckCircle, XCircle, ShoppingCart, ReceiptText, Pencil, Plus, Trash2 } from 'lucide-react'
import { EtiquetaAprovacao, FinanceiroConta, FinanceiroLancamentoItem, FinanceiroParte, FinanceiroMateriaPrima } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL, CONDICAO_PAGAMENTO_LABEL, TIPO_LANCAMENTO_LABEL, STATUS_CONCILIACAO_LABEL, STATUS_CONCILIACAO_COLOR } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { formatarDocumento, hojeISO, statusExibicao, somarMeses } from '@/lib/financeiro-utils'
import SelecionarMateriaPrimaModal, { ItemNota } from '@/components/SelecionarMateriaPrimaModal'
import EtiquetaAprovacaoSeletor from '@/components/EtiquetaAprovacaoSeletor'

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

function DetalheDespesaContent() {
  const { usuario } = useAuth()
  const params = useParams()
  const lancamentoId = params.id as string
  const searchParams = useSearchParams()
  // Presente quando se chega aqui a partir de outra tela (ex: passo
  // Despesas Fixas do wizard de Orçamento) — o botão voltar deve retornar
  // pra lá, não pro default (lista de Despesas).
  const voltarPara = searchParams.get('voltarPara')

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

  // Transformar lançamento único em N parcelas (admin)
  const [parcelando, setParcelando] = useState(false)
  const [novasParcelas, setNovasParcelas] = useState(2)
  const [salvandoParcelas, setSalvandoParcelas] = useState(false)

  // Posição deste lançamento entre as ocorrências já geradas da mesma
  // recorrência (ex: 2/3) — o total cresce com o tempo, não é um total fixo.
  const [posicaoRecorrencia, setPosicaoRecorrencia] = useState<{ atual: number; total: number } | null>(null)

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
      .select(
        '*, parte:financeiro_partes!parte_id(nome, documento), conta:financeiro_contas(codigo, nome), extrato_transacao:financeiro_extrato_transacoes!extrato_transacao_id(status_conciliacao)'
      )
      .eq('id', lancamentoId)
      .single()
    if (error) console.error('Erro:', error)
    setLancamento(data)

    if (data?.recorrencia_id) {
      const { data: ocorrencias } = await supabase
        .from('financeiro_lancamentos')
        .select('id')
        .eq('recorrencia_id', data.recorrencia_id)
        .order('data_vencimento')
      const indice = (ocorrencias || []).findIndex((o: any) => o.id === lancamentoId)
      setPosicaoRecorrencia(indice >= 0 ? { atual: indice + 1, total: (ocorrencias || []).length } : null)
    } else {
      setPosicaoRecorrencia(null)
    }

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
    if (!window.confirm(`Marcar "${lancamento.descricao}" como paga hoje?`)) return
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

  async function mudarEtiqueta(nova: EtiquetaAprovacao | null) {
    if (!lancamento) return
    const anterior = lancamento.etiqueta_aprovacao
    setLancamento({ ...lancamento, etiqueta_aprovacao: nova })
    const { error } = await supabase
      .from('financeiro_lancamentos')
      .update({ etiqueta_aprovacao: nova, updated_at: new Date().toISOString() })
      .eq('id', lancamentoId)
    if (error) {
      console.error('Erro ao salvar etiqueta:', error)
      setLancamento((prev: any) => ({ ...prev, etiqueta_aprovacao: anterior }))
      alert('Erro ao salvar etiqueta: ' + error.message)
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
      ja_pago: lancamento.status === 'pago',
    })
    setErro('')
    setEditando(true)
  }

  // Status (pago/aberto) só é controlado aqui quando o lançamento não está
  // cancelado — registro cancelado é congelado, edição só mexe no cabeçalho.
  const podeControlarStatusNaEdicao = lancamento?.status !== 'cancelado'

  async function salvarEdicao() {
    if (!lancamento || !formEdicao) return
    if (!formEdicao.parte_id || !formEdicao.data_lancamento || !formEdicao.data_vencimento) {
      setErro('Preencha fornecedor/beneficiário, data de lançamento e vencimento.')
      return
    }

    const statusEraPago = lancamento.status === 'pago'
    const novoJaPago = podeControlarStatusNaEdicao ? !!formEdicao.ja_pago : statusEraPago
    if (podeControlarStatusNaEdicao && novoJaPago && !formEdicao.data_pagamento) {
      setErro('Informe a data de pagamento.')
      return
    }
    if (podeControlarStatusNaEdicao && statusEraPago && !novoJaPago && lancamento.extrato_transacao_id) {
      setErro('Esta despesa já está vinculada a uma transação do extrato — desfaça a conciliação antes de marcar como aberta de novo.')
      return
    }
    if (!!lancamento.valor_pago_conciliado && lancamento.valor_pago_conciliado > 0) {
      setErro('Esta despesa já tem pagamentos parciais conciliados — não dá pra editar o valor ou o status por aqui.')
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
        forma_pagamento: formEdicao.forma_pagamento || null,
        condicao_pagamento: formEdicao.condicao_pagamento || null,
        unidade: formEdicao.unidade,
        updated_at: new Date().toISOString(),
      }
      if (podeControlarStatusNaEdicao) {
        payload.status = novoJaPago ? 'pago' : 'aberto'
        payload.data_pagamento = novoJaPago ? formEdicao.data_pagamento : null
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

  // Escopo restrito de propósito: só 1x -> Nx. Reparcelar um grupo que já é
  // parcelado fica de fora — a lógica de "achar as outras parcelas e
  // renumerar" é bem mais arriscada e não é o caso pedido.
  const podeParcelar =
    ehAdmin &&
    lancamento?.status === 'aberto' &&
    !lancamento?.extrato_transacao_id &&
    !(lancamento?.valor_pago_conciliado && lancamento.valor_pago_conciliado > 0) &&
    (!lancamento?.parcela_total || lancamento.parcela_total === 1)

  async function confirmarParcelamento() {
    if (!lancamento || !usuario) return
    setSalvandoParcelas(true)
    setErro('')
    try {
      const n = novasParcelas
      const valorParcela = Math.round((lancamento.valor_total / n) * 100) / 100
      const valorUltima = Math.round((lancamento.valor_total - valorParcela * (n - 1)) * 100) / 100
      const grupo = crypto.randomUUID()
      const descricaoBase = lancamento.descricao

      // Vira parcela 1/N no mesmo id — itens da nota (se houver) continuam
      // apontando pra cá, sem efeito colateral no CMV/DRE.
      const { data: atualizado, error: erroAtual } = await supabase
        .from('financeiro_lancamentos')
        .update({
          descricao: `${descricaoBase} (1/${n})`,
          valor_total: valorParcela,
          parcela_num: 1,
          parcela_total: n,
          grupo_parcelamento: grupo,
          condicao_pagamento: 'a_prazo',
          updated_at: new Date().toISOString(),
        })
        .eq('id', lancamentoId)
        .eq('status', 'aberto')
        .select('id')
      if (erroAtual) throw erroAtual
      if (!atualizado || atualizado.length === 0) throw new Error('Este lançamento mudou de status em outra sessão — atualize a tela.')

      // data_competencia igual em todas as parcelas (mesmo padrão da criação
      // em despesas/nova e compras/nova) — parcelar não pode espalhar o
      // reconhecimento da despesa no DRE por vários meses, só o pagamento.
      const linhas = Array.from({ length: n - 1 }, (_, i) => ({
        tipo: lancamento.tipo,
        parte_id: lancamento.parte_id,
        descricao: `${descricaoBase} (${i + 2}/${n})`,
        valor_total: i === n - 2 ? valorUltima : valorParcela,
        numero_documento: lancamento.numero_documento || null,
        data_lancamento: lancamento.data_lancamento,
        data_competencia: lancamento.data_competencia,
        data_vencimento: somarMeses(lancamento.data_vencimento, i + 1),
        data_pagamento: null,
        status: 'aberto',
        forma_pagamento: lancamento.forma_pagamento || null,
        condicao_pagamento: 'a_prazo',
        parcela_num: i + 2,
        parcela_total: n,
        grupo_parcelamento: grupo,
        unidade: lancamento.unidade,
        conta_id: lancamento.tipo === 'despesa' ? lancamento.conta_id : null,
        criado_por: usuario.id,
      }))
      const { error: erroNovas } = await supabase.from('financeiro_lancamentos').insert(linhas)
      if (erroNovas) throw erroNovas

      setParcelando(false)
      await carregar()
    } catch (err: any) {
      setErro('Erro ao parcelar: ' + (err?.message || 'desconhecido'))
    } finally {
      setSalvandoParcelas(false)
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
        <NotFoundState title="Lançamento não encontrado" backHref={voltarPara || '/financeiro/despesas'} />
      </ProtectedRoute>
    )
  }

  const st = statusExibicao(lancamento.status, lancamento.data_vencimento, lancamento.valor_pago_conciliado)

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title={lancamento.descricao}
          subtitle={
            <span className="flex items-center gap-1.5">
              {lancamento.tipo === 'compra_insumos' ? <ShoppingCart size={12} /> : <ReceiptText size={12} />}
              {TIPO_LANCAMENTO_LABEL[lancamento.tipo]}
              {lancamento.parcela_num && lancamento.parcela_total && ` · parcela ${lancamento.parcela_num}/${lancamento.parcela_total}`}
            </span>
          }
          backHref={voltarPara || '/financeiro/despesas'}
          actions={
            <>
              {ehAdmin && !editando && (
                <button onClick={iniciarEdicao} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500" title="Editar lançamento">
                  <Pencil size={18} />
                </button>
              )}
              <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${st.cor}`}>{st.label}</span>
            </>
          }
        />

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
                {ehAdmin && lancamento.status === 'aberto' && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Etiqueta</span>
                    <EtiquetaAprovacaoSeletor
                      valor={lancamento.etiqueta_aprovacao}
                      onChange={(nova) => mudarEtiqueta(nova)}
                    />
                  </div>
                )}
                {!!lancamento.valor_juros_multa && lancamento.valor_juros_multa > 0 && (
                  <div className="flex justify-between">
                    <span className="text-red-600 text-xs">Juros/multa por atraso</span>
                    <span className="text-red-600 text-xs font-medium">+ {formatBRL(lancamento.valor_juros_multa)}</span>
                  </div>
                )}
                {!!lancamento.valor_pago_conciliado && lancamento.valor_pago_conciliado > 0 && lancamento.status === 'aberto' && (
                  <div className="flex justify-between">
                    <span className="text-blue-600 text-xs">Pago até agora (conciliação parcial)</span>
                    <span className="text-blue-600 text-xs font-medium">
                      {formatBRL(lancamento.valor_pago_conciliado)} · faltam {formatBRL(lancamento.valor_total - lancamento.valor_pago_conciliado)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Valor</span><span className="font-semibold text-gray-800">{formatBRL(lancamento.valor_total)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Data do lançamento</span><span className="text-gray-800">{new Date(lancamento.data_lancamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Vencimento</span><span className="text-gray-800">{new Date(lancamento.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                {lancamento.data_pagamento && (
                  <div className="flex justify-between"><span className="text-gray-500">Paga em</span><span className="text-gray-800">{new Date(lancamento.data_pagamento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>
                )}
                {lancamento.extrato_transacao_id && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Conciliação bancária</span>
                    {lancamento.extrato_transacao ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONCILIACAO_COLOR[lancamento.extrato_transacao.status_conciliacao]}`}
                      >
                        {STATUS_CONCILIACAO_LABEL[lancamento.extrato_transacao.status_conciliacao]}
                      </span>
                    ) : (
                      <span className="text-gray-800">Vinculada ao extrato</span>
                    )}
                  </div>
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
                  <div className="flex justify-between">
                    <span className="text-gray-500">Origem</span>
                    <span className="text-purple-700">
                      🔄 Despesa recorrente{posicaoRecorrencia && ` · ${posicaoRecorrencia.atual}/${posicaoRecorrencia.total}`}
                    </span>
                  </div>
                )}
                {lancamento.recorrencia_id && posicaoRecorrencia && posicaoRecorrencia.total > 1 && (
                  <p className="text-[11px] text-amber-600 -mt-1.5">
                    Editar este lançamento não afeta as outras {posicaoRecorrencia.total - 1} ocorrência(s) desta recorrência.
                  </p>
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
                {podeControlarStatusNaEdicao && (
                  <div>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setFormEdicao({ ...formEdicao, ja_pago: false })}
                        className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold ${
                          !formEdicao.ja_pago ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        Em aberto
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormEdicao({ ...formEdicao, ja_pago: true, data_pagamento: formEdicao.data_pagamento || hojeISO() })
                        }
                        className={`flex-1 px-3 py-2 rounded-lg border-2 text-xs font-semibold ${
                          formEdicao.ja_pago ? 'border-green-600 bg-green-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        Já foi paga
                      </button>
                    </div>
                    {formEdicao.ja_pago && (
                      <>
                        <label className="block text-xs text-gray-500 mb-1">Pago em</label>
                        <input
                          type="date"
                          value={formEdicao.data_pagamento}
                          onChange={(e) => setFormEdicao({ ...formEdicao, data_pagamento: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                        />
                      </>
                    )}
                    {lancamento.status === 'pago' && !formEdicao.ja_pago && lancamento.extrato_transacao_id && (
                      <p className="text-xs text-amber-600 mt-1">
                        Vinculada a uma transação do extrato — desfaça a conciliação antes de reabrir.
                      </p>
                    )}
                  </div>
                )}
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

          {podeParcelar && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              {!parcelando ? (
                <button
                  onClick={() => setParcelando(true)}
                  className="text-sm font-semibold text-pink-700 hover:text-pink-800"
                >
                  Alterar parcelamento
                </button>
              ) : (
                <div className="space-y-3">
                  <h2 className="font-semibold text-gray-800">Alterar parcelamento</h2>
                  <p className="text-xs text-gray-500">
                    Transforma este lançamento único em parcelas — o valor total é dividido igualmente (a última parcela absorve o arredondamento).
                  </p>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Nº de parcelas</label>
                    <select
                      value={novasParcelas}
                      onChange={(e) => setNovasParcelas(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                        <option key={n} value={n}>{n}x de {formatBRL(lancamento.valor_total / n)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={confirmarParcelamento}
                      disabled={salvandoParcelas}
                      className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {salvandoParcelas ? 'Salvando...' : `Confirmar ${novasParcelas}x`}
                    </button>
                    <button
                      onClick={() => setParcelando(false)}
                      disabled={salvandoParcelas}
                      className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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

          {podeEditar && !editando && lancamento.status !== 'cancelado' && (
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
          onMateriaPrimaCriada={(nova) => setMaterias((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}
    </ProtectedRoute>
  )
}

export default function DetalheDespesaPage() {
  return (
    <Suspense>
      <DetalheDespesaContent />
    </Suspense>
  )
}
