'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import EditarContaModal from '@/components/EditarContaModal'
import NovaContaModal from '@/components/NovaContaModal'
import { useAuth } from '@/hooks/useAuth'
import { FinanceiroConta, FinanceiroCentroCusto } from '@/lib/types'
import { buscarCentrosCusto, buscarContas } from '@/lib/financeiro-contas'
import { LINHA_DRE_LABEL } from '@/lib/constants'
import { Plus } from 'lucide-react'

const APLICAVEL_LABEL: Record<string, string> = {
  compras_insumos: 'Compras de Insumos',
  despesas_gerais: 'Despesas Gerais',
  ambos: 'Ambos',
}

export default function ContasPage() {
  const { usuario } = useAuth()
  const [centros, setCentros] = useState<FinanceiroCentroCusto[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [loading, setLoading] = useState(true)
  const [contaEditando, setContaEditando] = useState<FinanceiroConta | null>(null)
  const [criandoConta, setCriandoConta] = useState(false)

  const podeEditar = usuario?.role === 'admin'

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const [c, ct] = await Promise.all([buscarCentrosCusto(), buscarContas()])
    setCentros(c)
    setContas(ct)
    setLoading(false)
  }

  function atualizarNaLista(conta: FinanceiroConta) {
    setContas((prev) => prev.map((c) => (c.id === conta.id ? conta : c)))
  }

  function adicionarNaLista(conta: FinanceiroConta) {
    setContas((prev) => [...prev, conta].sort((a, b) => a.codigo.localeCompare(b.codigo)))
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="Plano de Contas"
          backHref="/financeiro"
          maxWidth="max-w-3xl"
          actions={
            podeEditar ? (
              <button
                onClick={() => setCriandoConta(true)}
                className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
              >
                <Plus size={18} /> Nova Conta
              </button>
            ) : undefined
          }
        />

        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-500 mb-4">
            Centro de custo e conta vêm do seu plano de contas real. "Grupo DRE" é um rótulo livre usado na exibição do
            Plano de Contas e do Orçamento. "Linha da cascata do DRE" é o que define em qual seção do DRE reestruturado
            cada conta entra — {podeEditar ? 'toque numa conta pra ajustar.' : 'só admin pode editar.'}
          </p>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : (
            <div className="space-y-6">
              {centros.map((cc) => (
                <div key={cc.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <p className="font-semibold text-gray-800">{cc.codigo} — {cc.nome}</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {contas.filter((c) => c.centro_custo_id === cc.id).map((c) => {
                      const conteudo = (
                        <>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-800">
                              {c.codigo} — {c.nome}
                              {!c.ativo && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativa</span>}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">Grupo DRE: {c.grupo_dre}</p>
                            <p className="text-xs mt-0.5">
                              <span className={c.linha_dre ? 'text-gray-500' : 'text-amber-600'}>
                                Cascata: {c.linha_dre ? LINHA_DRE_LABEL[c.linha_dre] : 'Não classificado'}
                              </span>
                              {!c.afeta_dre && <span className="ml-2 text-amber-600">· Reserva (não afeta DRE)</span>}
                            </p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap flex-shrink-0">
                            {APLICAVEL_LABEL[c.aplicavel_a]}
                          </span>
                        </>
                      )
                      return podeEditar ? (
                        <button
                          key={c.id}
                          onClick={() => setContaEditando(c)}
                          className="w-full px-4 py-3 flex items-center justify-between text-sm text-left hover:bg-gray-50"
                        >
                          {conteudo}
                        </button>
                      ) : (
                        <div key={c.id} className="px-4 py-3 flex items-center justify-between text-sm">
                          {conteudo}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {contaEditando && (
          <EditarContaModal
            conta={contaEditando}
            centros={centros}
            onClose={() => setContaEditando(null)}
            onSaved={atualizarNaLista}
          />
        )}
        {criandoConta && (
          <NovaContaModal centros={centros} onClose={() => setCriandoConta(false)} onCreated={adicionarNaLista} />
        )}
      </div>
    </ProtectedRoute>
  )
}
