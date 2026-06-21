'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Plus } from 'lucide-react'

const LOCAL_LABEL: Record<string, string> = { loja1: 'Loja 1', loja2: 'Loja 2', cozinha: 'Cozinha' }
const STATUS_COLOR: Record<string, string> = {
  na_cozinha: 'bg-blue-100 text-blue-700',
  enviado: 'bg-amber-100 text-amber-700',
  na_loja: 'bg-green-100 text-green-700',
  esgotado: 'bg-gray-100 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  na_cozinha: 'Na cozinha',
  enviado: 'Enviado',
  na_loja: 'Na loja',
  esgotado: 'Esgotado',
}

export default function ProducaoPage() {
  const [lotes, setLotes] = useState<any[]>([])
  const [filtro, setFiltro] = useState('na_cozinha')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase.from('lotes_producao')
      .select('*, produto:produtos(nome, unidade_medida, congelado)')
      .eq('status', filtro)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setLotes(data || []); setLoading(false) })
  }, [filtro])

  async function marcarEnviado(id: string) {
    await supabase.from('lotes_producao').update({ status: 'enviado' }).eq('id', id)
    setLotes(prev => prev.filter(l => l.id !== id))
  }

  async function marcarNaLoja(id: string) {
    await supabase.from('lotes_producao').update({ status: 'na_loja' }).eq('id', id)
    setLotes(prev => prev.filter(l => l.id !== id))
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between pt-4 mb-4">
        <h1 className="text-xl font-bold text-gray-800">Produção</h1>
        <Link href="/producao/novo-lote" className="bg-gray-800 text-white rounded-lg px-3 py-1.5 text-sm flex items-center gap-1">
          <Plus size={16} /> Lote
        </Link>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFiltro(key)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap border ${filtro === key ? STATUS_COLOR[key] + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : lotes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum lote</div>
      ) : (
        <div className="space-y-2">
          {lotes.map(lote => (
            <div key={lote.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-1">
                <p className="font-semibold text-gray-800">{lote.produto?.nome}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[lote.status]}`}>{STATUS_LABEL[lote.status]}</span>
              </div>
              <p className="text-sm text-gray-500">
                {lote.quantidade} {lote.produto?.unidade_medida === 'Gramas' ? 'potes' : 'un'}
                {lote.peso_gramas ? ` · ${lote.peso_gramas}g` : ''}
                {lote.produto?.congelado ? ' ❄️' : ''}
                {' · '}{LOCAL_LABEL[lote.destino]}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Produção: {new Date(lote.data_producao + 'T00:00:00').toLocaleDateString('pt-BR')} ·
                Validade: {new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
              </p>
              <p className="text-xs text-gray-400">Por: {lote.produzido_por} · {lote.codigo_qr}</p>
              <div className="flex gap-2 mt-3">
                {lote.status === 'na_cozinha' && (
                  <button onClick={() => marcarEnviado(lote.id)} className="flex-1 bg-amber-500 text-white rounded-lg py-1.5 text-sm font-medium">
                    Marcar como Enviado
                  </button>
                )}
                {lote.status === 'enviado' && (
                  <button onClick={() => marcarNaLoja(lote.id)} className="flex-1 bg-green-600 text-white rounded-lg py-1.5 text-sm font-medium">
                    Confirmar Recebimento
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
