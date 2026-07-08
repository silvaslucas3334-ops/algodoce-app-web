'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function NovaPartePage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [papelFornecedor, setPapelFornecedor] = useState(false)
  const [papelBeneficiario, setPapelBeneficiario] = useState(false)
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const podeSalvar = nome.trim() && (papelFornecedor || papelBeneficiario)

  async function salvar() {
    if (!podeSalvar) {
      setErro('Informe o nome e marque pelo menos um papel (fornecedor ou beneficiário).')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_partes').insert({
        nome: nome.trim(),
        documento: documento.replace(/\D/g, '') || null,
        papel_fornecedor: papelFornecedor,
        papel_beneficiario: papelBeneficiario,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        observacoes: observacoes.trim() || null,
      })
      if (error) throw error
      router.push('/financeiro/partes')
    } catch (err: any) {
      console.error('Erro ao salvar parte:', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50">
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
              <label className="block text-sm font-medium text-gray-700 mb-2">CNPJ ou CPF (opcional)</label>
              <input
                type="text"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Só números ou com pontuação"
              />
              <p className="text-xs text-gray-400 mt-1">Usado para identificar automaticamente pagamentos PIX no extrato bancário.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Papel</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={papelFornecedor} onChange={(e) => setPapelFornecedor(e.target.checked)} className="w-4 h-4 rounded" />
                  Fornecedor de insumo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={papelBeneficiario} onChange={(e) => setPapelBeneficiario(e.target.checked)} className="w-4 h-4 rounded" />
                  Beneficiário de despesa geral
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-1">Pode marcar as duas, se a mesma parte também prestar um serviço avulso.</p>
            </div>

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
