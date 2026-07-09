'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FinanceiroParte, FinanceiroConta, UnidadeFinanceiro, FormaPagamento, CondicaoPagamento } from '@/lib/types'
import { UNIDADE_LABEL, FORMA_PAGAMENTO_LABEL } from '@/lib/constants'
import { formatBRL } from '@/lib/ofx'
import { calcularVencimento, formatarDocumento, hojeISO, somarMeses } from '@/lib/financeiro-utils'

export default function NovaDespesaPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [partes, setPartes] = useState<FinanceiroParte[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])

  const unidadeTravada: UnidadeFinanceiro | null =
    usuario?.role === 'cozinha' ? 'cozinha' : usuario?.role === 'loja' ? usuario?.loja_id : null

  const [parteId, setParteId] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataLancamento, setDataLancamento] = useState(hojeISO())
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>(unidadeTravada || 'cozinha')
  const [contaId, setContaId] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')

  // Pagamento (pré-preenchido pelo cadastro do beneficiário, editável)
  const [jaPago, setJaPago] = useState(false)
  const [dataPagamento, setDataPagamento] = useState(hojeISO())
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [condicao, setCondicao] = useState<CondicaoPagamento>('a_vista')
  const [dataVencimento, setDataVencimento] = useState(hojeISO())
  const [parcelas, setParcelas] = useState(1)
  const [recorrente, setRecorrente] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (unidadeTravada) setUnidade(unidadeTravada)
  }, [unidadeTravada])

  useEffect(() => {
    supabase
      .from('financeiro_partes')
      .select('*')
      .eq('papel_beneficiario', true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPartes(data || []))
    supabase
      .from('financeiro_contas')
      .select('*')
      .in('aplicavel_a', ['despesas_gerais', 'ambos'])
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [])

  const parte = partes.find((p) => p.id === parteId)

  // Ao escolher o beneficiário, herda forma/condição do cadastro e calcula
  // o vencimento pela condição (à vista = data do lançamento; a prazo = + prazo).
  useEffect(() => {
    if (!parte) return
    setFormaPagamento(parte.forma_pagamento_padrao || '')
    setCondicao(parte.condicao_pagamento)
    setDataVencimento(calcularVencimento(dataLancamento, parte.condicao_pagamento, parte.prazo_dias))
  }, [parteId])

  useEffect(() => {
    setDataVencimento(calcularVencimento(dataLancamento, condicao, parte?.prazo_dias))
  }, [dataLancamento, condicao])

  const valorNum = Number(valor)
  // Recorrência é exclusiva do admin (RLS de financeiro_recorrencias) e
  // incompatível com parcelamento (uma despesa fixa se repete inteira).
  const podeRecorrencia = usuario?.role === 'admin' && parcelas === 1
  const podeSalvar = parteId && descricao.trim() && valorNum > 0 && contaId && dataLancamento && (!jaPago ? dataVencimento : dataPagamento)

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha beneficiário, descrição, valor e a conta contábil (obrigatória).')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      let recorrenciaId: string | null = null

      if (recorrente && podeRecorrencia) {
        const [anoV, mesV, diaV] = dataVencimento.split('-').map(Number)
        const diaVencimento = Math.min(diaV, 28)
        const { data: rec, error: erroRec } = await supabase
          .from('financeiro_recorrencias')
          .insert({
            parte_id: parteId,
            descricao: descricao.trim(),
            valor: valorNum,
            dia_vencimento: diaVencimento,
            forma_pagamento: formaPagamento || null,
            unidade,
            conta_id: contaId,
            ativa: true,
            // O lançamento deste mês é criado abaixo; a recorrência começa no mês seguinte.
            proxima_data: `${mesV === 12 ? anoV + 1 : anoV}-${String((mesV % 12) + 1).padStart(2, '0')}-${String(diaVencimento).padStart(2, '0')}`,
            criado_por: usuario.id,
          })
          .select('id')
          .single()
        if (erroRec) throw erroRec
        recorrenciaId = rec.id
      }

      const nParcelas = jaPago || recorrente ? 1 : parcelas
      const grupo = nParcelas > 1 ? crypto.randomUUID() : null
      const valorParcela = Math.round((valorNum / nParcelas) * 100) / 100
      const valorUltima = Math.round((valorNum - valorParcela * (nParcelas - 1)) * 100) / 100

      const linhas = Array.from({ length: nParcelas }, (_, i) => ({
        tipo: 'despesa',
        parte_id: parteId,
        descricao: nParcelas > 1 ? `${descricao.trim()} (${i + 1}/${nParcelas})` : descricao.trim(),
        valor_total: i === nParcelas - 1 ? valorUltima : valorParcela,
        numero_documento: numeroDocumento.trim() || null,
        data_lancamento: dataLancamento,
        data_vencimento: i === 0 ? dataVencimento : somarMeses(dataVencimento, i),
        data_pagamento: jaPago ? dataPagamento : null,
        status: jaPago ? 'pago' : 'aberto',
        forma_pagamento: formaPagamento || null,
        condicao_pagamento: condicao,
        parcela_num: nParcelas > 1 ? i + 1 : null,
        parcela_total: nParcelas > 1 ? nParcelas : null,
        grupo_parcelamento: grupo,
        recorrencia_id: recorrenciaId,
        unidade,
        conta_id: contaId,
        criado_por: usuario.id,
      }))

      const { error } = await supabase.from('financeiro_lancamentos').insert(linhas)
      if (error) throw error

      router.push('/financeiro/despesas')
    } catch (err: any) {
      console.error('Erro ao salvar despesa:', err)
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
              <h1 className="text-xl font-bold text-gray-800">Nova Despesa</h1>
              <p className="text-xs text-gray-500">Para compras de insumo com nota, use "Lançar Nota"</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {/* Dados da despesa */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Dados da despesa</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Beneficiário</label>
              <select value={parteId} onChange={(e) => setParteId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {partes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              {partes.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum beneficiário cadastrado — peça ao admin para cadastrar.</p>}
            </div>

            {parte && (
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-0.5">
                <p><strong>{parte.nome}</strong> · {formatarDocumento(parte.documento)}</p>
                <p>
                  Pagamento usual: {parte.forma_pagamento_padrao ? FORMA_PAGAMENTO_LABEL[parte.forma_pagamento_padrao] : 'não definido'} ·{' '}
                  {parte.condicao_pagamento === 'a_prazo' ? `a prazo (${parte.prazo_dias} dias)` : 'à vista'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: Aluguel de julho, salário Catarina..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor (R$)</label>
                <input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Data da despesa</label>
                <input type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Conta contábil (obrigatória)</label>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Direciona a despesa para a linha certa do DRE e do fluxo de caixa.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nº documento (opcional)</label>
                <input type="text" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>
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
                onClick={() => {
                  setJaPago(true)
                  setParcelas(1)
                }}
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
                  <p className="text-xs text-gray-400 mt-1">Preenchido pela condição do cadastro — ajuste livremente.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Parcelas</label>
                  <select
                    value={parcelas}
                    onChange={(e) => {
                      setParcelas(Number(e.target.value))
                      if (Number(e.target.value) > 1) setRecorrente(false)
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'À vista (1x)' : `${n}x de ${valorNum > 0 ? formatBRL(valorNum / n) : '—'}`}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {podeRecorrencia && (
              <label className="flex items-start gap-2 text-sm text-gray-700 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                <input
                  type="checkbox"
                  checked={recorrente}
                  onChange={(e) => setRecorrente(e.target.checked)}
                  className="w-4 h-4 rounded mt-0.5"
                />
                <span>
                  <strong>Despesa recorrente (mensal)</strong>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Todo mês o sistema gera automaticamente esta despesa no mesmo dia de vencimento (ex: aluguel, internet). O valor pode ser ajustado a cada mês no lançamento gerado.
                  </span>
                </span>
              </label>
            )}
          </div>

          <button onClick={salvar} disabled={salvando || !podeSalvar} className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {salvando ? 'Salvando...' : parcelas > 1 && !jaPago ? `Salvar (${parcelas} parcelas)` : 'Salvar'}
          </button>
        </div>
      </div>
    </ProtectedRoute>
  )
}
