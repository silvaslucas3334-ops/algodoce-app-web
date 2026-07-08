'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FinanceiroConta } from '@/lib/types'

export default function NovaMateriaPrimaPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState('g')
  const [unidadeCompra, setUnidadeCompra] = useState('kg')
  const [fatorConversao, setFatorConversao] = useState('1000')
  const [contaId, setContaId] = useState('')
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase
      .from('financeiro_contas')
      .select('*')
      .in('aplicavel_a', ['compras_insumos', 'ambos'])
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [])

  const podeSalvar = nome.trim() && unidadeMedida.trim() && unidadeCompra.trim() && Number(fatorConversao) > 0

  async function salvar() {
    if (!podeSalvar) {
      setErro('Preencha nome, unidades e um fator de conversão maior que zero.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { error } = await supabase.from('financeiro_materias_primas').insert({
        nome: nome.trim(),
        unidade_medida: unidadeMedida.trim(),
        unidade_compra: unidadeCompra.trim(),
        fator_conversao: Number(fatorConversao),
        conta_id: contaId || null,
        descricao: descricao.trim() || null,
      })
      if (error) throw error
      router.push('/financeiro/materias-primas')
    } catch (err: any) {
      console.error('Erro ao salvar matéria-prima:', err)
      const msg = err?.code === '23505' ? 'Já existe uma matéria-prima com esse nome.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
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
            <h1 className="text-xl font-bold text-gray-800">Nova Matéria-Prima</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: Limão Taiti"
              />
              <p className="text-xs text-gray-400 mt-1">Nome único — evita duplicar como "Limão", "Limão kg" etc.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade de compra</label>
                <input
                  type="text"
                  value={unidadeCompra}
                  onChange={(e) => setUnidadeCompra(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="kg, caixa, un..."
                />
                <p className="text-xs text-gray-400 mt-1">Como aparece na nota fiscal</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade da ficha técnica</label>
                <input
                  type="text"
                  value={unidadeMedida}
                  onChange={(e) => setUnidadeMedida(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="g, ml, un..."
                />
                <p className="text-xs text-gray-400 mt-1">Usada na receita (fase futura)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fator de conversão</label>
              <input
                type="number"
                step="any"
                min={0}
                value={fatorConversao}
                onChange={(e) => setFatorConversao(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">
                Quantas unidades de "{unidadeMedida || 'medida'}" tem em 1 "{unidadeCompra || 'compra'}". Ex: 1 kg = 1000 g → 1000.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Conta contábil do item</label>
              <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white">
                <option value="">Definir depois</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Ex: farinha → 1001 Matéria-Prima; caixa de bolo → 1002 Embalagem. Toda compra deste item herda essa conta automaticamente.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Descrição (opcional)</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
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
