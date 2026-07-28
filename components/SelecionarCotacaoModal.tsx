'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Search, Loader } from 'lucide-react'

interface CotacaoFechada {
  id: string
  titulo: string
  fechado_em: string | null
  fornecedor_vencedor: { nome: string } | null
}

interface Props {
  jaImportadasIds: string[]
  onSelect: (cotacaoId: string) => void
  onClose: () => void
}

// Lista cotações fechadas pra importar itens/preços numa nota — não filtra
// por "já usada em alguma nota" (não existe esse rastreio hoje, e reimportar
// não quebra nada, só duplicaria itens se o usuário escolher de novo). Só
// esconde as que já foram importadas NESTA nota em edição.
export default function SelecionarCotacaoModal({ jaImportadasIds, onSelect, onClose }: Props) {
  const [cotacoes, setCotacoes] = useState<CotacaoFechada[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    supabase
      .from('financeiro_cotacoes')
      .select('id, titulo, fechado_em, fornecedor_vencedor:financeiro_partes!fornecedor_vencedor_id(nome)')
      .eq('status', 'fechada')
      .order('fechado_em', { ascending: false })
      .then(({ data }) => {
        setCotacoes((data as any) || [])
        setLoading(false)
      })
  }, [])

  const disponiveis = cotacoes.filter((c) => !jaImportadasIds.includes(c.id))
  const filtradas = disponiveis.filter((c) => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return true
    return c.titulo.toLowerCase().includes(termo) || (c.fornecedor_vencedor?.nome || '').toLowerCase().includes(termo)
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Importar cotação</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            autoFocus
            placeholder="Pesquisar por título ou fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
              <Loader size={18} className="animate-spin" /> Carregando cotações...
            </div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {disponiveis.length === 0 ? 'Nenhuma cotação fechada disponível.' : `Nenhuma cotação encontrada${busca ? ` para "${busca}"` : ''}.`}
            </p>
          ) : (
            filtradas.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm bg-gray-50 text-gray-700 hover:bg-pink-50 hover:text-pink-800 border border-gray-200"
              >
                <p className="font-medium">{c.titulo}</p>
                <p className="text-xs text-gray-500">
                  Vencedor: {c.fornecedor_vencedor?.nome || '—'}
                  {c.fechado_em && ` · Fechada em ${new Date(c.fechado_em).toLocaleDateString('pt-BR')}`}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
