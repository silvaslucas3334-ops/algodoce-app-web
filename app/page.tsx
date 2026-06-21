'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'

export default function Dashboard() {
  const [ordens, setOrdens] = useState(0)
  const [producaoAtiva, setProducaoAtiva] = useState(0)
  const [lotesProxVencer, setLotesProxVencer] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const hoje = new Date().toISOString().split('T')[0]
      const em3dias = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]

      const [{ count: totalOrdens }, { count: emProducao }, { data: vencendo }] = await Promise.all([
        supabase.from('ordens_producao').select('*', { count: 'exact', head: true }).eq('status', 'pendente'),
        supabase.from('ordens_producao').select('*', { count: 'exact', head: true }).eq('status', 'em_producao'),
        supabase.from('lotes_producao')
          .select('*, produto:produtos(nome)')
          .in('status', ['na_loja', 'na_cozinha'])
          .lte('data_validade', em3dias)
          .gte('data_validade', hoje)
          .order('data_validade')
          .limit(5),
      ])

      setOrdens(totalOrdens || 0)
      setProducaoAtiva(emProducao || 0)
      setLotesProxVencer(vencendo || [])
      setLoading(false)
    }
    carregar()
  }, [])

  const localLabel = (l: string) => l === 'loja1' ? 'Loja 1' : l === 'loja2' ? 'Loja 2' : 'Cozinha'

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6 pt-4">
        <div>
          <h1 className="text-2xl font-bold text-pink-700">AlgoDoce</h1>
          <p className="text-sm text-gray-500">Gestão de produção</p>
        </div>
        <div className="text-right text-sm text-gray-500">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link href="/ordens" className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={18} className="text-amber-500" />
                <span className="text-xs text-gray-500">Ordens pendentes</span>
              </div>
              <p className="text-3xl font-bold text-gray-800">{ordens}</p>
            </Link>
            <Link href="/producao" className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={18} className="text-green-500" />
                <span className="text-xs text-gray-500">Em produção</span>
              </div>
              <p className="text-3xl font-bold text-gray-800">{producaoAtiva}</p>
            </Link>
          </div>

          {lotesProxVencer.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-amber-600" />
                <span className="font-semibold text-amber-700">Vencendo em breve</span>
              </div>
              <div className="space-y-2">
                {lotesProxVencer.map((lote) => (
                  <div key={lote.id} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700">{lote.produto?.nome}</span>
                    <div className="text-right">
                      <span className="text-amber-600 font-medium">
                        {new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-gray-400 text-xs ml-2">· {localLabel(lote.destino)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link href="/ordens/nova" className="bg-pink-700 text-white rounded-xl p-4 shadow-sm text-center">
              <p className="font-semibold">+ Nova Ordem</p>
              <p className="text-xs text-pink-200 mt-0.5">Solicitar produção</p>
            </Link>
            <Link href="/producao/novo-lote" className="bg-gray-800 text-white rounded-xl p-4 shadow-sm text-center">
              <p className="font-semibold">+ Registrar Lote</p>
              <p className="text-xs text-gray-400 mt-0.5">Cozinha</p>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
