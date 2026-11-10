'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FinanceiroConta, FinanceiroMateriaPrima } from '@/lib/types'
import { X } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: (materia: FinanceiroMateriaPrima) => void
}

// Cadastro rápido — nome, unidades e CONTA CONTÁBIL (obrigatória: toda compra herda a conta, e item de
// nota sem conta distorce o DRE). A descrição continua só na tela cheia /financeiro/materias-primas/[id].
export default function NovaMateriaPrimaRapidaModal({ onClose, onCreated }: Props) {
  const [nome, setNome] = useState('')
  const [unidadeCompra, setUnidadeCompra] = useState('kg')
  const [unidadeMedida, setUnidadeMedida] = useState('g')
  const [fatorConversao, setFatorConversao] = useState('1000')
  const [contaId, setContaId] = useState('')
  const [contas, setContas] = useState<FinanceiroConta[]>([])
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

  const podeSalvar = nome.trim() && unidadeMedida.trim() && unidadeCompra.trim() && Number(fatorConversao) > 0 && !!contaId

  async function salvar() {
    if (!podeSalvar) {
      setErro(
        !contaId
          ? 'Escolha a conta contábil do item — sem ela as compras deste item ficam fora do DRE.'
          : 'Preencha nome, unidades e um fator de conversão maior que zero.'
      )
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const { data, error } = await supabase
        .from('financeiro_materias_primas')
        .insert({
          nome: nome.trim(),
          unidade_medida: unidadeMedida.trim(),
          unidade_compra: unidadeCompra.trim(),
          fator_conversao: Number(fatorConversao),
          conta_id: contaId,
        })
        .select('*, conta:financeiro_contas(codigo, nome)')
        .single()
      if (error) throw error
      onCreated(data)
      onClose()
    } catch (err: any) {
      const msg = err?.code === '23505' ? 'Já existe uma matéria-prima com esse nome.' : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              placeholder="Ex: Limão Taiti"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Unidade de compra</label>
              <input
                type="text"
                value={unidadeCompra}
                onChange={(e) => setUnidadeCompra(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="kg, caixa, un..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Unidade da ficha técnica</label>
              <input
                type="text"
                value={unidadeMedida}
                onChange={(e) => setUnidadeMedida(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="g, ml, un..."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Fator de conversão</label>
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
            <label htmlFor="conta-mp-rapida" className="block text-sm font-medium text-gray-700 mb-1.5">Conta contábil do item (obrigatória)</label>
            <select
              id="conta-mp-rapida"
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              aria-required="true"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white ${contaId ? 'border-gray-300' : 'border-amber-400'}`}
            >
              <option value="">Selecione a conta…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">Ex: farinha → 1001 Matéria-Prima; caixa de bolo → 1002 Embalagem.</p>
          </div>
          <p className="text-xs text-gray-400">A descrição fica disponível depois, no cadastro completo.</p>
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
