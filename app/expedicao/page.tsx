'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, ChevronRight, Package, CheckCircle, AlertCircle, ArrowRightLeft } from 'lucide-react'

export default function ExpedicaoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [romaneios, setRomaneios] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [abaPrincipal, setAbaPrincipal] = useState<string>('envios')

  // Determinar aba padrão baseado na role
  useEffect(() => {
    if (usuario?.role === 'loja') {
      setAbaPrincipal('recebimentos')
    } else {
      setAbaPrincipal('envios')
    }
  }, [usuario?.role])

  // Carregar romaneios
  useEffect(() => {
    carregarRomaneios()

    const channel = supabase
      .channel('romaneios-real')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'romaneios' },
        carregarRomaneios
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [abaPrincipal])

  async function carregarRomaneios() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('romaneios')
        .select('*')
        .order('data_entrega', { ascending: true })

      if (error) throw error
      console.log('Romaneios carregados:', JSON.stringify(data?.map(r => ({ id: r.id, tipo: r.tipo, status: r.status, unidade_destino: r.unidade_destino }))))
      setRomaneios(data || [])
    } catch (err) {
      console.error('Erro ao carregar romaneios:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filtros para Cozinha
  const enviosCozinha = romaneios.filter(
    (r) => r.tipo === 'envio' && (r.status === 'rascunho' || r.status === 'confirmado')
  )
  const devolucoesRecebidas = romaneios.filter(
    (r) => r.tipo === 'transferencia' && r.status === 'confirmado'
  )

  // Filtros para Loja
  const recebimentosLoja = romaneios.filter(
    (r) => r.status === 'confirmado' && r.unidade_destino === usuario?.loja_id && (r.tipo === 'envio' || r.tipo === 'transferencia')
  )
  const transferenciasLoja = romaneios.filter(
    (r) => r.tipo === 'transferencia' && (r.status === 'rascunho' || r.status === 'confirmado') && r.unidade_destino === usuario?.loja_id
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package size={28} />
            Expedição
          </h1>
        </div>
      </div>

      {/* Abas - diferentes por role */}
      <div className="bg-white border-b border-gray-200 sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-4">
            {usuario?.role === 'cozinha' || usuario?.role === 'admin' ? (
              <>
                <button
                  onClick={() => setAbaPrincipal('envios')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    abaPrincipal === 'envios'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  📦 Envios
                </button>
                <button
                  onClick={() => setAbaPrincipal('devolucoes')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    abaPrincipal === 'devolucoes'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <ArrowRightLeft size={18} /> Devoluções Recebidas
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setAbaPrincipal('recebimentos')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    abaPrincipal === 'recebimentos'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  📥 Recebimentos
                </button>
                <button
                  onClick={() => setAbaPrincipal('transferencias')}
                  className={`px-4 py-3 font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    abaPrincipal === 'transferencias'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <ArrowRightLeft size={18} /> Transferências
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* COZINHA - ENVIOS */}
        {usuario?.role === 'cozinha' && abaPrincipal === 'envios' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Envios</h2>
              <button
                onClick={() => router.push('/expedicao/novo')}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-blue-700 font-semibold"
              >
                <Plus size={18} /> Novo Envio
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : enviosCozinha.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Package size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhum envio aberto</p>
              </div>
            ) : (
              <div className="space-y-3">
                {enviosCozinha.map((romaneio) => (
                  <Link key={romaneio.id} href={`/expedicao/${romaneio.id}`}>
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-lg font-bold text-gray-800">
                              Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${romaneio.status === 'rascunho' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {romaneio.status === 'rascunho' ? 'Rascunho' : 'Confirmado'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {romaneio.linhas?.length || 0} produto(s) · Criado em {new Date(romaneio.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <ChevronRight size={24} className="text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* COZINHA - DEVOLUÇÕES RECEBIDAS */}
        {usuario?.role === 'cozinha' && abaPrincipal === 'devolucoes' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Devoluções Recebidas</h2>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : devolucoesRecebidas.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhuma devolução pendente de recebimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {devolucoesRecebidas.map((romaneio) => (
                  <div key={romaneio.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-bold text-gray-800 mb-1">
                          Devolução de: {romaneio.unidade_destino === 'loja1' ? 'Paraisópolis' : 'Itajubá'}
                        </p>
                        <p className="text-sm text-gray-600">{romaneio.linhas?.length || 0} produto(s)</p>
                      </div>
                      <Link href={`/expedicao/receber-transferencia/${romaneio.id}`}>
                        <button className="bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 font-semibold">
                          Receber
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* LOJA - RECEBIMENTOS */}
        {usuario?.role === 'loja' && abaPrincipal === 'recebimentos' && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-6">Recebimentos Pendentes</h2>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : recebimentosLoja.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <CheckCircle size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhum envio pendente de recebimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recebimentosLoja.map((romaneio) => (
                  <div key={romaneio.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-lg font-bold text-gray-800 mb-1">
                          Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-sm text-gray-600">{romaneio.linhas?.length || 0} produto(s)</p>
                      </div>
                      <Link href={`/expedicao/receber/${romaneio.id}`}>
                        <button className="bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 font-semibold">
                          Receber
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* LOJA - TRANSFERÊNCIAS */}
        {usuario?.role === 'loja' && abaPrincipal === 'transferencias' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800">Transferências</h2>
              <button
                onClick={() => router.push('/expedicao/nova-transferencia')}
                className="bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-blue-700 font-semibold"
              >
                <Plus size={18} /> Nova Transferência
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : transferenciasLoja.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Package size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600">Nenhuma transferência aberta</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transferenciasLoja.map((romaneio) => (
                  <Link key={romaneio.id} href={`/expedicao/transferencia/${romaneio.id}`}>
                    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="text-lg font-bold text-gray-800">
                              Para: {romaneio.unidade_destino === 'loja1' ? 'Paraisópolis' : romaneio.unidade_destino === 'loja2' ? 'Itajubá' : 'Cozinha'}
                            </p>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${romaneio.status === 'rascunho' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                              {romaneio.status === 'rascunho' ? 'Rascunho' : 'Confirmado'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {romaneio.linhas?.length || 0} produto(s) · Criado em {new Date(romaneio.criado_em).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <ChevronRight size={24} className="text-gray-400" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
