'use client'
import { useState } from 'react'
import { atualizarConta, DadosConta } from '@/lib/financeiro-contas'
import { FinanceiroCentroCusto, FinanceiroConta, LinhaDre } from '@/lib/types'
import { LINHA_DRE_LABEL, LINHA_DRE_ORDEM } from '@/lib/constants'
import { X } from 'lucide-react'

interface Props {
  conta: FinanceiroConta
  centros: FinanceiroCentroCusto[]
  onClose: () => void
  onSaved: (conta: FinanceiroConta) => void
}

const APLICAVEL_LABEL: Record<string, string> = {
  compras_insumos: 'Compras de Insumos',
  despesas_gerais: 'Despesas Gerais',
  ambos: 'Ambos',
}

export default function EditarContaModal({ conta, centros, onClose, onSaved }: Props) {
  const [nome, setNome] = useState(conta.nome)
  const [centroCustoId, setCentroCustoId] = useState(conta.centro_custo_id)
  const [grupoDre, setGrupoDre] = useState(conta.grupo_dre)
  const [linhaDre, setLinhaDre] = useState<LinhaDre | ''>(conta.linha_dre || '')
  const [aplicavelA, setAplicavelA] = useState(conta.aplicavel_a)
  const [afetaDre, setAfetaDre] = useState(conta.afeta_dre)
  const [ativo, setAtivo] = useState(conta.ativo)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const podeSalvar = nome.trim() && grupoDre.trim() && centroCustoId

  async function salvar() {
    if (!podeSalvar) {
      setErro('Preencha nome, centro de custo e grupo de DRE.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const dados: Partial<DadosConta> & { ativo: boolean } = {
        nome: nome.trim(),
        centro_custo_id: centroCustoId,
        grupo_dre: grupoDre.trim(),
        linha_dre: linhaDre || null,
        aplicavel_a: aplicavelA,
        afeta_dre: afetaDre,
        ativo,
      }
      await atualizarConta(conta.id, dados)
      onSaved({ ...conta, ...dados, linha_dre: linhaDre || null })
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{conta.codigo} — Editar Conta</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Grupo DRE (rótulo livre de exibição)</label>
            <input
              type="text"
              value={grupoDre}
              onChange={(e) => setGrupoDre(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
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
              Em qual seção do DRE em cascata esta conta entra. "Não classificado" ainda soma no resultado final, mas
              fica fora da cascata até você definir uma linha.
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
                Desmarque só para contas de reserva/provisão (aplicação financeira, ativo fixo, 13º/férias). Lançamentos
                nela não entram como despesa no resultado — aparecem à parte, em "Aportes em Reserva". Use com cuidado:
                isso muda o Resultado Líquido calculado.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span className="text-sm text-gray-700">Ativa (aparece pra seleção em novos lançamentos)</span>
          </label>

          <button
            onClick={salvar}
            disabled={salvando || !podeSalvar}
            className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
