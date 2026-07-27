'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FinanceiroParte } from '@/lib/types'
import { validarDocumento } from '@/lib/financeiro-utils'
import { X } from 'lucide-react'

interface Props {
  papelPadrao: 'fornecedor' | 'beneficiario'
  onClose: () => void
  onCreated: (parte: FinanceiroParte) => void
}

// Cadastro rápido — só os campos obrigatórios (nome, documento, papel).
// Telefone/e-mail/forma de pagamento continuam só na tela cheia
// /financeiro/partes/[id], editável depois sem nada perdido.
export default function NovaParteRapidaModal({ papelPadrao, onClose, onCreated }: Props) {
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [papelFornecedor, setPapelFornecedor] = useState(papelPadrao === 'fornecedor')
  const [papelBeneficiario, setPapelBeneficiario] = useState(papelPadrao === 'beneficiario')
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
      const { data, error } = await supabase
        .from('financeiro_partes')
        .insert({ nome: nome.trim(), documento: documentoDigitos, papel_fornecedor: papelFornecedor, papel_beneficiario: papelBeneficiario })
        .select('*')
        .single()
      if (error) throw error
      onCreated(data)
      onClose()
    } catch (err: any) {
      const msg = err?.code === '23505' ? 'Já existe um cadastro com esse CPF/CNPJ.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-sm w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Cadastro rápido</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome / Razão Social</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">CPF ou CNPJ</label>
            <input
              type="text"
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm ${
                documentoDigitos.length > 0 && !documentoValido ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="Só números ou com pontuação"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Papel</label>
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
          <p className="text-xs text-gray-400">Telefone, e-mail e forma de pagamento ficam disponíveis depois, no cadastro completo.</p>
          <button
            onClick={salvar}
            disabled={salvando || !podeSalvar}
            className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Cadastrar e usar'}
          </button>
        </div>
      </div>
    </div>
  )
}
