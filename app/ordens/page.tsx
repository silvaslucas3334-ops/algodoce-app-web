'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
  em_producao: { label: 'Em produção', color: 'bg-blue-100 text-blue-700' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
}

const LOCAL_LABEL: Record<string, string> = { loja1: 'Loja 1', loja2: 'Loja 2', cozinha: 'Cozinha' }

export default function OrdensPage() {
  const [ordens, setOrdens] = useState<any[]>([])
  const [filtro, setFiltro] = useState<string>('pendente')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      setLoading(true)
      const { data } = await supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome)')
        .eq('status', filtro)
        .order('created_at', { ascending: false })
      setOrdens(data || [])
      setLoading(false)
    }
    carregar()
  }, [filtro])

  async function atualizarStatus(id: string, novoStatus: string) {
    await supabase.from('ordens_producao').update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', id)
    setOrdens(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between pt-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Ordens de Produção</h1>
        <Link href="/ordens/nova" className="bg-pink-700 text-white rounded-lg px-3 py-1.5 text-sm flex items-center gap-1">
          <Plus size={16} /> Nova
        </Link>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {Object.entries(STATUS_LABEL).map(([key, { label, color }]) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${filtro === key ? color + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : ordens.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhuma ordem {STATUS_LABEL[filtro]?.label.toLowerCase()}</div>
      ) : (
        <div className="space-y-2">
          {ordens.map(ordem => (
            <div key={ordem.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {ordem.quantidade}x · {LOCAL_LABEL[ordem.loja_destino]} · {ordem.solicitado_por}
                  </p>
                  {ordem.observacao && <p className="text-xs text-gray-400 mt-1 italic">{ordem.observacao}</p>}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_LABEL[ordem.status]?.color}`}>
                  {STATUS_LABEL[ordem.status]?.label}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                {ordem.status === 'pendente' && (
                  <button
                    onClick={() => atualizarStatus(ordem.id, 'em_producao')}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-sm font-medium"
                  >
                    Iniciar produção
                  </button>
                )}
                {ordem.status === 'em_producao' && (
                  <Link
                    href={`/producao/novo-lote?ordem=${ordem.id}&produto=${ordem.produto_id}`}
                    className="flex-1 bg-green-600 text-white rounded-lg py-1.5 text-sm font-medium text-center"
                  >
                    Registrar lote
                  </Link>
                )}
                {(ordem.status === 'pendente' || ordem.status === 'em_producao') && (
                  <button
                    onClick={() => atualizarStatus(ordem.id, 'cancelada')}
                    className="px-3 bg-gray-100 text-gray-500 rounded-lg py-1.5 text-sm"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
