'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FinanceiroParte, FinanceiroConta, UnidadeFinanceiro } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'

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
  const [dataVencimento, setDataVencimento] = useState('')
  const [unidade, setUnidade] = useState<UnidadeFinanceiro>(unidadeTravada || 'cozinha')
  const [contaId, setContaId] = useState('')
  const [numeroDocumento, setNumeroDocumento] = useState('')
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

  const podeSalvar = parteId && descricao.trim() && Number(valor) > 0 && dataVencimento

  async function salvar() {
    if (!podeSalvar || !usuario) {
      setErro('Preencha beneficiário, descrição, valor e vencimento.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_despesas').insert({
        parte_id: parteId,
        descricao: descricao.trim(),
        valor: Number(valor),
        data_vencimento: dataVencimento,
        unidade,
        conta_id: contaId || null,
        numero_documento: numeroDocumento.trim() || null,
        status: 'aberto',
        criado_por: usuario.id,
      })
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
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Nova Despesa</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Beneficiário</label>
              <select value={parteId} onChange={(e) => setParteId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Selecione...</option>
                {partes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              {partes.length === 0 && <p className="text-xs text-amber-600 mt-1">Nenhum beneficiário cadastrado ainda — peça ao admin para cadastrar em Fornecedores/Beneficiários.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição</label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: Aluguel de junho, guia de imposto..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Valor (R$)</label>
                <input type="number" step="0.01" min={0} value={valor} onChange={(e) => setValor(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vencimento</label>
                <input type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Conta contábil (opcional)</label>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Não sei / classificar depois</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nº documento / nota (opcional)</label>
              <input type="text" value={numeroDocumento} onChange={(e) => setNumeroDocumento(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
            </div>

            <button onClick={salvar} disabled={salvando || !podeSalvar} className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
