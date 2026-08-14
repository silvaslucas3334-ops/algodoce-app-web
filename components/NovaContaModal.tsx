'use client'
import { useState } from 'react'
import { criarConta, DadosConta } from '@/lib/financeiro-contas'
import { FinanceiroCentroCusto, FinanceiroConta, LinhaDre } from '@/lib/types'
import { LINHA_DRE_LABEL, LINHA_DRE_ORDEM } from '@/lib/constants'
import { X } from 'lucide-react'

interface Props {
  centros: FinanceiroCentroCusto[]
  onClose: () => void
  onCreated: (conta: FinanceiroConta) => void
}

const APLICAVEL_LABEL: Record<string, string> = {
  compras_insumos: 'Compras de Insumos',
  despesas_gerais: 'Despesas Gerais',
  ambos: 'Ambos',
}

export default function NovaContaModal({ centros, onClose, onCreated }: Props) {
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [centroCustoId, setCentroCustoId] = useState(centros[0]?.id || '')
  const [grupoDre, setGrupoDre] = useState('')
  const [linhaDre, setLinhaDre] = useState<LinhaDre | ''>('')
  const [aplicavelA, setAplicavelA] = useState<DadosConta['aplicavel_a']>('ambos')
  const [afetaDre, setAfetaDre] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const podeSalvar = codigo.trim() && nome.trim() && grupoDre.trim() && centroCustoId

  async function salvar() {
    if (!podeSalvar) {
      setErro('Preencha código, nome, centro de custo e grupo de DRE.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const conta = await criarConta({
        codigo: codigo.trim(),
        nome: nome.trim(),
        centro_custo_id: centroCustoId,
        grupo_dre: grupoDre.trim(),
        linha_dre: linhaDre || null,
        aplicavel_a: aplicavelA,
        afeta_dre: afetaDre,
      })
      onCreated(conta)
      onClose()
    } catch (err: any) {
      const msg = err?.message?.includes('duplicate') || err?.code === '23505'
        ? 'Já existe uma conta com esse código.'
        : 'Erro ao salvar: ' + (err?.message || 'desconhecido')
      setErro(msg)
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Nova Conta</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Código</label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Ex: 1008"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Centro de custo</label>
              <select
                value={centroCustoId}
                onChange={(e) => setCentroCustoId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
              >
                {centros.map((cc) => (
                  <option key={cc.id} value={cc.id}>{cc.codigo} — {cc.nome}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              placeholder="Ex: Manutenção de Equipamentos"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Grupo DRE (rótulo livre de exibição)</label>
            <input
              type="text"
              value={grupoDre}
              onChange={(e) => setGrupoDre(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
              placeholder="Ex: Despesas Diversas"
            />
            <p className="text-xs text-gray-400 mt-1">Usado pra agrupar a exibição do Plano de Contas e do Orçamento. Não afeta a cascata do DRE.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Linha da cascata do DRE</label>
            <select
              value={linhaDre}
              onChange={(e) => setLinhaDre(e.target.value as LinhaDre | '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              <option value="">Não classificado</option>
              {LINHA_DRE_ORDEM.map((l) => (
                <option key={l} value={l}>{LINHA_DRE_LABEL[l]}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Dá pra deixar "Não classificado" e definir depois — o valor ainda entra no resultado, só fica fora da
              cascata até você escolher a linha certa.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Aplicável a</label>
            <select
              value={aplicavelA}
              onChange={(e) => setAplicavelA(e.target.value as DadosConta['aplicavel_a'])}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
            >
              {Object.entries(APLICAVEL_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={afetaDre} onChange={(e) => setAfetaDre(e.target.checked)} className="mt-0.5" />
            <span className="text-sm text-gray-700">
              Afeta o DRE
              <span className="block text-xs text-gray-400 mt-0.5">
                Desmarque só para contas de reserva/provisão (aplicação financeira, ativo fixo, 13º/férias) — lançamentos
                nela não entram como despesa no resultado.
              </span>
            </span>
          </label>

          <button
            onClick={salvar}
            disabled={salvando || !podeSalvar}
            className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}
