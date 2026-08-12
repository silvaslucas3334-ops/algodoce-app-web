'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useRouter } from 'next/navigation'
import { FinanceiroConta } from '@/lib/types'

export default function NovaMateriaPrimaPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [unidadeMedida, setUnidadeMedida] = useState('g')
  const [unidadeCompra, setUnidadeCompra] = useState('kg')
  const [fatorConversao, setFatorConversao] = useState('1000')
  const [unidadeFornecedor, setUnidadeFornecedor] = useState('')
  const [fatorUnidadeFornecedor, setFatorUnidadeFornecedor] = useState('')
  const [custoManual, setCustoManual] = useState('')
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
      // Par opcional — só grava se os dois vierem preenchidos juntos (uma
      // unidade sem fator, ou vice-versa, não serve pra calcular nada).
      const fornecedorCompleto = unidadeFornecedor.trim() && Number(fatorUnidadeFornecedor) > 0
      const { error } = await supabase.from('financeiro_materias_primas').insert({
        nome: nome.trim(),
        unidade_medida: unidadeMedida.trim(),
        unidade_compra: unidadeCompra.trim(),
        fator_conversao: Number(fatorConversao),
        unidade_fornecedor: fornecedorCompleto ? unidadeFornecedor.trim() : null,
        fator_unidade_fornecedor: fornecedorCompleto ? Number(fatorUnidadeFornecedor) : null,
        custo_manual_por_unidade_compra: custoManual.trim() ? Number(custoManual) : null,
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
        <PageHeader title="Nova Matéria-Prima" onBack={() => router.back()} />

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
                <p className="text-xs text-gray-400 mt-1">Usada nas receitas de pré-preparo e produto final</p>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unidade do fornecedor (opcional)</label>
                <input
                  type="text"
                  value={unidadeFornecedor}
                  onChange={(e) => setUnidadeFornecedor(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                  placeholder="pct, fardo..."
                />
                <p className="text-xs text-gray-400 mt-1">Como o fornecedor vende, se for diferente da unidade de compra</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Fator do fornecedor</label>
                <input
                  type="number"
                  step="any"
                  min={0}
                  value={fatorUnidadeFornecedor}
                  onChange={(e) => setFatorUnidadeFornecedor(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Quantas "{unidadeCompra || 'compra'}" tem em 1 "{unidadeFornecedor || 'fornecedor'}". Ex: 1 pacote = 5 kg → 5.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custo manual (opcional) — R$ por {unidadeCompra || 'unidade de compra'}
              </label>
              <input
                type="number"
                step="any"
                min={0}
                value={custoManual}
                onChange={(e) => setCustoManual(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: 8.50"
              />
              <p className="text-xs text-gray-400 mt-1">
                Pra itens sem nota ainda (ex: sal, azeite comprados antes do sistema) — dá um custo de partida até a primeira compra real ser lançada.
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
