'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FormaPagamento, CondicaoPagamento } from '@/lib/types'
import { FORMA_PAGAMENTO_LABEL } from '@/lib/constants'
import { validarDocumento } from '@/lib/financeiro-utils'

export default function NovaPartePage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [papelFornecedor, setPapelFornecedor] = useState(false)
  const [papelBeneficiario, setPapelBeneficiario] = useState(false)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>('')
  const [condicao, setCondicao] = useState<CondicaoPagamento>('a_vista')
  const [prazoDias, setPrazoDias] = useState<number>(7)
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const documentoDigitos = documento.replace(/\D/g, '')
  const documentoValido = validarDocumento(documento)
  const podeSalvar = nome.trim() && documentoValido && (papelFornecedor || papelBeneficiario)

  async function salvar() {
    if (!podeSalvar) {
      setErro(
        !documentoValido && documentoDigitos.length > 0
          ? 'CPF/CNPJ inválido — confira os dígitos.'
          : 'Preencha nome, CPF/CNPJ válido e marque pelo menos um papel.'
      )
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_partes').insert({
        nome: nome.trim(),
        documento: documentoDigitos,
        papel_fornecedor: papelFornecedor,
        papel_beneficiario: papelBeneficiario,
        forma_pagamento_padrao: formaPagamento || null,
        condicao_pagamento: condicao,
        prazo_dias: condicao === 'a_prazo' ? prazoDias : null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        observacoes: observacoes.trim() || null,
      })
      if (error) throw error
      router.push('/financeiro/partes')
    } catch (err: any) {
      console.error('Erro ao salvar parte:', err)
      const msg = err?.code === '23505' ? 'Já existe um cadastro com esse CPF/CNPJ.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Novo Fornecedor/Beneficiário</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome / Razão Social</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: DMA Distribuidora S/A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">CPF ou CNPJ (obrigatório)</label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm ${
                  documentoDigitos.length > 0 && !documentoValido ? 'border-red-400' : 'border-gray-300'
                }`}
                placeholder="Só números ou com pontuação"
              />
              {documentoDigitos.length > 0 && !documentoValido && (
                <p className="text-xs text-red-600 mt-1">CPF/CNPJ inválido.</p>
              )}
              <p className="text-xs text-gray-400 mt-1">Usado para identificar automaticamente pagamentos PIX no extrato bancário.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Papel</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={papelFornecedor} onChange={(e) => setPapelFornecedor(e.target.checked)} className="w-4 h-4 rounded" />
                  Fornecedor
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={papelBeneficiario} onChange={(e) => setPapelBeneficiario(e.target.checked)} className="w-4 h-4 rounded" />
                  Beneficiário
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Forma de pagamento padrão</label>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Condição de pagamento</label>
                <select
                  value={condicao}
                  onChange={(e) => setCondicao(e.target.value as CondicaoPagamento)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
                >
                  <option value="a_vista">À vista</option>
                  <option value="a_prazo">A prazo</option>
                </select>
              </div>
            </div>

            {condicao === 'a_prazo' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Prazo do boleto</label>
                <div className="flex gap-2">
                  {[7, 15, 30].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrazoDias(p)}
                      className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold ${
                        prazoDias === p ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      {p} dias
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Contados da data da compra — o vencimento é preenchido automaticamente no lançamento.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefone</label>
                <input type="text" value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">E-mail</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm h-20 resize-none"
              />
            </div>

            <button
              onClick={salvar}
              disabled={salvando || !podeSalvar}
              className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
