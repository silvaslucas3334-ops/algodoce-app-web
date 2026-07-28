'use client'
import { useEffect, useState, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import SelecionarMateriaPrimaModal, { ItemNota } from '@/components/SelecionarMateriaPrimaModal'
import SelecionarCotacaoModal from '@/components/SelecionarCotacaoModal'
import NovaParteRapidaModal from '@/components/NovaParteRapidaModal'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import { FinanceiroParte, FinanceiroMateriaPrima, UnidadeFinanceiro, FormaPagamento, CondicaoPagamento } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { calcularVencimento, formatarDocumento, hojeISO, somarMeses } from '@/lib/financeiro-utils'
import { vincularTransacaoCriada } from '@/lib/financeiro-reconciliacao'

const TOLERANCIA_CENTAVOS = 0.02

function LancarNotaForm() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const [materias, setMaterias] = useState<FinanceiroMateriaPrima[]>([])
  const [fornecedores, setFornecedores] = useState<FinanceiroParte[]>([])
  const [modalNovoFornecedor, setModalNovoFornecedor] = useState(false)

  // Vindo da conciliação do extrato: a nota precisa bater com o valor da
  // transação bancária para poder ser conciliada automaticamente.
  const extratoTransacaoId = params.get('extratoTransacaoId')
  const extratoValor = params.get('valor') ? Number(params.get('valor')) : null
  const extratoData = params.get('data')
  const extratoUnidade = params.get('unidade') as UnidadeFinanceiro | null
  const extratoDocumento = params.get('documento')

  // Vindo do fechamento de uma cotação: diferente do extrato, aqui NÃO é um
  // pagamento já feito — é uma decisão. Os campos vêm pré-preenchidos mas
  // editáveis, e "já foi paga" não é forçado (a NF real chega depois). Mais
  // de uma cotação pode ser importada na mesma nota (fornecedor que
  // consolida vários pedidos numa NF só) — cada importação SOMA itens ao
  // carrinho, nunca substitui.
  const cotacaoId = params.get('cotacaoId')
  const [cotacoesImportadas, setCotacoesImportadas] = useState<{ id: string; titulo: string }[]>([])
  const [cotacaoUnidade, setCotacaoUnidade] = useState<UnidadeFinanceiro | null>(null)
  const [avisoCotacao, setAvisoCotacao] = useState('')
  const [modalCotacao, setModalCotacao] = useState(false)

  // Cozinha não é uma entidade própria — seus custos entram como rateio (0001).
  const unidadeTravada: UnidadeFinanceiro | null =
    usuario?.role === 'cozinha' ? 'rateio' : usuario?.role === 'loja' ? usuario?.loja_id : null

  // Dados da nota
  const [fornecedorId, setFornecedorId] = useState('')
  const [numeroNota, setNumeroNota] = useState('')
  const [dataCompra, setDataCompra] = useState(extratoData || hojeISO())
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>(unidadeTravada || extratoUnidade || 'loja1')

  // Itens
  const [itens, setItens] = useState<ItemNota[]>([])
  const [modalAberto, setModalAberto] = useState(false)

  // Pagamento (pré-preenchido pelo cadastro do fornecedor, editável)
  const [jaPago, setJaPago] = useState(!!extratoTransacaoId)
  const [dataPagamento, setDataPagamento] = useState(extratoData || hojeISO())
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [condicao, setCondicao] = useState<CondicaoPagamento>('a_vista')
  const [dataVencimento, setDataVencimento] = useState(hojeISO())
  const [parcelas, setParcelas] = useState(1)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (unidadeTravada) setUnidade(unidadeTravada)
    else if (cotacaoUnidade) setUnidade(cotacaoUnidade)
  }, [unidadeTravada, cotacaoUnidade])

  // Busca uma cotação fechada + itens + preços do fornecedor vencedor, e
  // SOMA ao array de itens já no carrinho (nunca substitui — permite
  // importar mais de uma cotação na mesma nota). A cotação já está
  // persistida, então dá pra buscar de novo por id em vez de serializar um
  // array inteiro na querystring.
  async function importarCotacao(idCotacao: string) {
    setAvisoCotacao('')
    const { data: cot, error: erroCot } = await supabase
      .from('financeiro_cotacoes')
      .select('titulo, unidade, fornecedor_vencedor_id')
      .eq('id', idCotacao)
      .single()
    if (erroCot || !cot?.fornecedor_vencedor_id) {
      setErro('Cotação não encontrada ou ainda não fechada com um fornecedor vencedor.')
      return
    }

    // Só a 1ª cotação importada decide fornecedor/unidade — importações
    // seguintes só somam itens, sem sobrescrever o que o usuário já ajustou.
    if (cotacoesImportadas.length === 0) {
      setCotacaoUnidade(cot.unidade)
      setFornecedorId(cot.fornecedor_vencedor_id)
    } else if (cot.fornecedor_vencedor_id !== fornecedorId) {
      setAvisoCotacao(`Atenção: o vencedor desta cotação é diferente do fornecedor já selecionado na nota.`)
    }

    const { data: cotacaoFornecedor } = await supabase
      .from('financeiro_cotacao_fornecedores')
      .select('id')
      .eq('cotacao_id', idCotacao)
      .eq('parte_id', cot.fornecedor_vencedor_id)
      .single()
    if (!cotacaoFornecedor) return

    const [{ data: itensCotacao }, { data: precos }] = await Promise.all([
      supabase
        .from('financeiro_cotacao_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome, conta_id, unidade_compra, fator_conversao, conta:financeiro_contas(codigo, nome))')
        .eq('cotacao_id', idCotacao),
      supabase.from('financeiro_cotacao_precos').select('*').eq('cotacao_fornecedor_id', cotacaoFornecedor.id),
    ])

    const itensPreenchidos: ItemNota[] = (itensCotacao || [])
      .map((item: any) => {
        const preco = (precos || []).find((p: any) => p.cotacao_item_id === item.id)
        if (!preco || !preco.disponivel) return null
        return {
          materia_prima_id: item.materia_prima_id,
          materia_prima_nome: item.materia_prima?.nome || '',
          quantidade: item.quantidade,
          unidade_nota: item.unidade_cotacao,
          fator_conversao: item.materia_prima?.fator_conversao || 1,
          valor_unitario: preco.valor_unitario || 0,
          valor_total: preco.valor_total || 0,
          conta_id: item.materia_prima?.conta_id || null,
          conta_label: item.materia_prima?.conta ? `${item.materia_prima.conta.codigo} — ${item.materia_prima.conta.nome}` : null,
        }
      })
      .filter((i: ItemNota | null): i is ItemNota => i !== null)
    setItens((prev) => [...prev, ...itensPreenchidos])
    setCotacoesImportadas((prev) => [...prev, { id: idCotacao, titulo: cot.titulo }])
  }

  useEffect(() => {
    if (cotacaoId) importarCotacao(cotacaoId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotacaoId])

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

  // Pré-seleciona o fornecedor se o CNPJ/CPF do extrato bater com algum
  // cadastro já carregado — melhor esforço, não bloqueia se não achar.
  useEffect(() => {
    if (!extratoDocumento || fornecedorId || fornecedores.length === 0) return
    const achado = fornecedores.find((f) => f.documento === extratoDocumento)
    if (achado) setFornecedorId(achado.id)
  }, [extratoDocumento, fornecedores])

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
  const diferencaExtrato = extratoValor != null ? totalNota - extratoValor : null
  const bateComExtrato = diferencaExtrato == null || Math.abs(diferencaExtrato) <= TOLERANCIA_CENTAVOS
  const podeSalvar =
    fornecedorId && dataCompra && itens.length > 0 && totalNota > 0 && (!jaPago ? dataVencimento : dataPagamento) && bateComExtrato

  function removerItem(indice: number) {
    setItens((prev) => prev.filter((_, i) => i !== indice))
  }

  async function salvar() {
    if (!podeSalvar || !usuario || !fornecedor) {
      setErro(
        !bateComExtrato
          ? 'O total da nota precisa bater com o valor da transação do extrato.'
          : 'Preencha fornecedor, data e adicione pelo menos um item.'
      )
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
        data_competencia: dataCompra,
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
        extrato_transacao_id: extratoTransacaoId || null,
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

      if (extratoTransacaoId) {
        try {
          await vincularTransacaoCriada(extratoTransacaoId, primeiro.id, fornecedorId)
        } catch (erroVinculo: any) {
          setErro(
            'Nota lançada, mas falhou ao marcar a transação do extrato como conciliada: ' +
              (erroVinculo?.message || 'desconhecido') +
              '. Concilie manualmente na aba Conciliar Extrato, dentro do Fluxo de Caixa.'
          )
          setSalvando(false)
          return
        }
        router.push('/financeiro/fluxo-caixa?tab=extrato')
        return
      }

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
        <PageHeader
          title="Lançar Nota de Insumos"
          subtitle={
            extratoTransacaoId
              ? 'Criando a partir de uma transação do extrato'
              : cotacoesImportadas.length > 0
                ? `Itens e preços vindos de ${cotacoesImportadas.length > 1 ? 'cotações' : 'cotação'} "${cotacoesImportadas.map((c) => c.titulo).join('", "')}" — confira e ajuste se necessário`
                : 'A nota gera automaticamente a despesa correspondente'
          }
          onBack={() => router.back()}
        />

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {/* Dados da nota */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados da nota</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Fornecedor</label>
                <button type="button" onClick={() => setModalNovoFornecedor(true)} className="text-xs font-medium text-pink-700 hover:text-pink-800">
                  + Cadastrar novo
                </button>
              </div>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
              {fornecedores.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum fornecedor cadastrado ainda.</p>}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalCotacao(true)}
                  className="border-2 border-gray-200 text-gray-700 rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-gray-50"
                >
                  <ClipboardList size={16} /> Importar cotação
                </button>
                <button
                  onClick={() => setModalAberto(true)}
                  className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
                >
                  <Plus size={16} /> Adicionar item
                </button>
              </div>
            </div>

            {avisoCotacao && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">{avisoCotacao}</div>
            )}

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
                {extratoValor != null && (
                  <div className={`flex justify-between items-center px-3 py-2 rounded-lg text-xs ${bateComExtrato ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    <span>Transação do extrato: {formatBRL(extratoValor)}</span>
                    <span className="font-semibold">
                      {bateComExtrato ? 'Bate com o total' : `Diferença: ${formatBRL(Math.abs(diferencaExtrato || 0))}`}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pagamento */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Pagamento</h2>

            {extratoTransacaoId ? (
              <div className="px-4 py-2.5 rounded-lg border-2 border-green-600 bg-green-600 text-white text-sm font-semibold text-center">
                Já foi paga (transação do extrato)
              </div>
            ) : (
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
            )}

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
                  {extratoTransacaoId ? (
                    <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-medium">
                      {new Date(dataPagamento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </div>
                  ) : (
                    <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
                  )}
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
      </div>

      {modalAberto && (
        <SelecionarMateriaPrimaModal
          materias={materias}
          onAdd={(item) => setItens((prev) => [...prev, item])}
          onClose={() => setModalAberto(false)}
          onMateriaPrimaCriada={(nova) => setMaterias((prev) => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)))}
        />
      )}

      {modalNovoFornecedor && (
        <NovaParteRapidaModal
          papelPadrao="fornecedor"
          onClose={() => setModalNovoFornecedor(false)}
          onCreated={(novo) => {
            setFornecedores((prev) => [...prev, novo].sort((a, b) => a.nome.localeCompare(b.nome)))
            setFornecedorId(novo.id)
          }}
        />
      )}

      {modalCotacao && (
        <SelecionarCotacaoModal
          jaImportadasIds={cotacoesImportadas.map((c) => c.id)}
          onSelect={(id) => {
            importarCotacao(id)
            setModalCotacao(false)
          }}
          onClose={() => setModalCotacao(false)}
        />
      )}
    </ProtectedRoute>
  )
}

export default function LancarNotaPage() {
  return (
    <Suspense>
      <LancarNotaForm />
    </Suspense>
  )
}
