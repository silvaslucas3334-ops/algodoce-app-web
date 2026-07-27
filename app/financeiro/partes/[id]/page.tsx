'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import NotFoundState from '@/components/NotFoundState'
import { useRouter, useParams } from 'next/navigation'
import { Loader } from 'lucide-react'
import { FinanceiroParte, FormaPagamento, CondicaoPagamento } from '@/lib/types'
import { FORMA_PAGAMENTO_LABEL } from '@/lib/constants'
import { validarDocumento } from '@/lib/financeiro-utils'
import { formatBRL } from '@/lib/ofx'

interface ResumoParte {
  pagoNoAno: number
  emAberto: number
  atrasado: number
}

export default function DetalheParteePage() {
  const router = useRouter()
  const params = useParams()
  const parteId = params.id as string

  const [parte, setParte] = useState<FinanceiroParte | null>(null)
  const [resumo, setResumo] = useState<ResumoParte | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    carregar()
    carregarResumo()
  }, [parteId])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase.from('financeiro_partes').select('*').eq('id', parteId).single()
    setParte(data)
    setLoading(false)
  }

  // Resumo pra responder "quanto gastei com esse fornecedor" sem precisar
  // cruzar a lista de Despesas manualmente — total pago no ano corrente,
  // em aberto e atrasado, sempre com base em hoje/ano atual.
  async function carregarResumo() {
    const hoje = new Date().toISOString().slice(0, 10)
    const inicioAno = `${new Date().getFullYear()}-01-01`
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .select('valor_total, status, data_pagamento, data_vencimento')
      .eq('parte_id', parteId)
      .neq('status', 'cancelado')
    if (error) {
      console.error('Erro ao carregar resumo do fornecedor:', error)
      return
    }
    const linhas = data || []
    const pagoNoAno = linhas
      .filter((l) => l.status === 'pago' && l.data_pagamento && l.data_pagamento >= inicioAno)
      .reduce((s, l) => s + l.valor_total, 0)
    const emAberto = linhas.filter((l) => l.status === 'aberto').reduce((s, l) => s + l.valor_total, 0)
    const atrasado = linhas
      .filter((l) => l.status === 'aberto' && l.data_vencimento < hoje)
      .reduce((s, l) => s + l.valor_total, 0)
    setResumo({ pagoNoAno, emAberto, atrasado })
  }

  const documentoValido = parte ? validarDocumento(parte.documento || '') : false

  async function salvar() {
    if (!parte) return
    if (!parte.nome.trim() || !documentoValido || !(parte.papel_fornecedor || parte.papel_beneficiario)) {
      setErro('Preencha nome, CPF/CNPJ válido e marque pelo menos um papel.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase
        .from('financeiro_partes')
        .update({
          nome: parte.nome.trim(),
          documento: parte.documento.replace(/\D/g, ''),
          papel_fornecedor: parte.papel_fornecedor,
          papel_beneficiario: parte.papel_beneficiario,
          forma_pagamento_padrao: parte.forma_pagamento_padrao || null,
          condicao_pagamento: parte.condicao_pagamento,
          prazo_dias: parte.condicao_pagamento === 'a_prazo' ? parte.prazo_dias || 7 : null,
          telefone: parte.telefone || null,
          email: parte.email || null,
          observacoes: parte.observacoes || null,
          ativo: parte.ativo,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parteId)
      if (error) throw error
      router.push('/financeiro/partes')
    } catch (err: any) {
      console.error('Erro ao salvar parte:', err)
      const msg = err?.code === '23505' ? 'Já existe um cadastro com esse CPF/CNPJ.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!parte) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <NotFoundState backHref="/financeiro/partes" />
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Editar Cadastro" onBack={() => router.back()} />

        <div className="max-w-2xl mx-auto px-4 py-6">
          {resumo && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-semibold">Pago em {new Date().getFullYear()}</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{formatBRL(resumo.pagoNoAno)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-semibold">Em aberto</p>
                <p className="text-lg font-bold text-gray-800 mt-1">{formatBRL(resumo.emAberto)}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-100">
                <p className="text-xs text-gray-500 uppercase font-semibold">Atrasado</p>
                <p className={`text-lg font-bold mt-1 ${resumo.atrasado > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatBRL(resumo.atrasado)}</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome / Razão Social</label>
              <input
                type="text"
                value={parte.nome}
                onChange={(e) => setParte({ ...parte, nome: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CPF ou CNPJ (obrigatório)</label>
              <input
                type="text"
                value={parte.documento || ''}
                onChange={(e) => setParte({ ...parte, documento: e.target.value })}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm ${
                  (parte.documento || '').length > 0 && !documentoValido ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {(parte.documento || '').length > 0 && !documentoValido && (
                <p className="text-xs text-red-600 mt-1">CPF/CNPJ inválido.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Papel</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={parte.papel_fornecedor}
                    onChange={(e) => setParte({ ...parte, papel_fornecedor: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Fornecedor
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={parte.papel_beneficiario}
                    onChange={(e) => setParte({ ...parte, papel_beneficiario: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  Beneficiário
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Forma de pagamento padrão</label>
                <select
                  value={parte.forma_pagamento_padrao || ''}
                  onChange={(e) => setParte({ ...parte, forma_pagamento_padrao: (e.target.value || undefined) as FormaPagamento | undefined })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                >
                  <option value="">Não definida</option>
                  {Object.entries(FORMA_PAGAMENTO_LABEL).map(([valor, label]) => (
                    <option key={valor} value={valor}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Condição de pagamento</label>
                <select
                  value={parte.condicao_pagamento}
                  onChange={(e) => setParte({ ...parte, condicao_pagamento: e.target.value as CondicaoPagamento })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                >
                  <option value="a_vista">À vista</option>
                  <option value="a_prazo">A prazo</option>
                </select>
              </div>
            </div>

            {parte.condicao_pagamento === 'a_prazo' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prazo do boleto</label>
                <div className="flex gap-2">
                  {[7, 15, 30].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setParte({ ...parte, prazo_dias: p })}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                        (parte.prazo_dias || 7) === p ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {p} dias
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                <input
                  type="text"
                  value={parte.telefone || ''}
                  onChange={(e) => setParte({ ...parte, telefone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">E-mail</label>
                <input
                  type="email"
                  value={parte.email || ''}
                  onChange={(e) => setParte({ ...parte, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                value={parte.observacoes || ''}
                onChange={(e) => setParte({ ...parte, observacoes: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={parte.ativo}
                onChange={(e) => setParte({ ...parte, ativo: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              Ativo
            </label>

            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
