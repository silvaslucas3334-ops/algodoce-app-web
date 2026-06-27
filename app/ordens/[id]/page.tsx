'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, Users, TrendingDown } from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
  em_producao: { label: 'Em produção', color: 'bg-blue-100 text-blue-700' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
}

export default function DetalhesOrdemPage() {
  const router = useRouter()
  const params = useParams()
  const [ordem, setOrdem] = useState<any>(null)
  const [lotes, setLotes] = useState<any[]>([])
  const [movimentacoes, setMovimentacoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarDetalhes()
  }, [params.id])

  async function carregarDetalhes() {
    setLoading(true)
    try {
      // Carregar ordem (sem filtros - mostrar para todos)
      const { data: ordemData } = await supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome, unidade_medida, validade_dias, congelado)')
        .eq('id', params.id)
        .single()

      if (ordemData) setOrdem(ordemData)

      // Carregar TODOS os lotes da ordem
      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*')
        .eq('ordem_id', params.id)
        .order('created_at')

      if (lotesData) setLotes(lotesData)

      // Carregar TODAS as movimentações dos lotes (incluindo cozinha)
      if (lotesData && lotesData.length > 0) {
        const loteIds = lotesData.map(l => l.id)
        const { data: movData } = await supabase
          .from('movimentacoes_estoque')
          .select('*')
          .in('lote_id', loteIds)
          .order('created_at')

        if (movData) setMovimentacoes(movData)
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>
  }

  if (!ordem) {
    return <div className="text-center py-12 text-gray-400">Ordem não encontrada</div>
  }

  return (
    <div className="p-4">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4 hover:text-gray-800">
        <ArrowLeft size={20} /> Voltar
      </button>

      {/* CABEÇALHO */}
      <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500">Ordem #{ordem.numero_ordem}</p>
            <p className="text-2xl font-bold text-gray-800">{ordem.produto?.nome}</p>
            <p className="text-sm text-gray-600 mt-1">
              📦 {ordem.quantidade} {ordem.produto?.unidade_medida} · {LOCAL_LABEL[ordem.loja_destino]}
            </p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_LABEL[ordem.status]?.color}`}>
            {STATUS_LABEL[ordem.status]?.label}
          </span>
        </div>
        {ordem.observacao && <p className="text-sm text-gray-600 italic">Obs: {ordem.observacao}</p>}
      </div>

      {/* TIMELINE DE RASTREABILIDADE */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <h2 className="font-bold text-lg text-gray-800 mb-4">🔍 Rastreabilidade</h2>

        <div className="space-y-6">
          {/* PENDENTE DE RECEBIMENTO - PRIMEIRO */}
          {lotes.some(l => l.status === 'enviado') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={20} className="text-yellow-600" />
                <h3 className="font-semibold text-gray-800">Pendente de Recebimento</h3>
              </div>
              <div className="ml-7 space-y-3 pb-4 border-l-2 border-gray-200 pl-4">
                {lotes.filter(l => l.status === 'enviado').map(lote => (
                  <div key={lote.id} className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
                    <p className="font-medium text-gray-800">{lote.codigo_qr}</p>
                    <p className="text-sm text-yellow-700 mt-1">Aguardando recebimento na loja</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MOVIMENTAÇÕES - SEGUNDO (MAIS RECENTE) */}
          {movimentacoes.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users size={20} className="text-amber-600" />
                <h3 className="font-semibold text-gray-800">Movimentações</h3>
              </div>
              <div className="ml-7 space-y-3 pb-4 border-l-2 border-gray-200 pl-4">
                {movimentacoes.map((mov: any) => {
                  const loteInfo = lotes.find(l => l.id === mov.lote_id)
                  const tipoLabel = {
                    transferencia: 'Enviado da Cozinha',
                    entrada: 'Recebido no Estoque',
                    saida: 'Dado Baixa (Venda)',
                  }[mov.tipo as keyof typeof {transferencia: string; entrada: string; saida: string}] || mov.tipo

                  const tipoColor = {
                    transferencia: 'bg-amber-50 border-amber-100',
                    entrada: 'bg-green-50 border-green-100',
                    saida: 'bg-red-50 border-red-100',
                  }[mov.tipo] || 'bg-gray-50 border-gray-100'

                  const tipoIconColor = {
                    transferencia: 'text-amber-600',
                    entrada: 'text-green-600',
                    saida: 'text-red-600',
                  }[mov.tipo] || 'text-gray-600'

                  return (
                    <div key={mov.id} className={`rounded-lg p-3 border ${tipoColor}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className={`font-medium ${tipoIconColor}`}>{tipoLabel}</p>
                          <p className="text-xs text-gray-600 mt-0.5">Etiqueta: {loteInfo?.codigo_qr?.substring(0, 16)}...</p>
                        </div>
                      </div>
                      <div className="space-y-2 text-xs mb-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-gray-500">Operador:</p>
                            <p className="font-medium text-gray-800">{mov.registrado_por || 'Sistema'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Data/Hora:</p>
                            <p className="font-medium text-gray-800">{new Date(mov.created_at).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>
                        {mov.local_origem && (
                          <div className="bg-white bg-opacity-40 rounded p-2">
                            <p className="text-gray-700">
                              📍 <strong>{LOCAL_LABEL[mov.local_origem]}</strong>
                              {mov.local_destino && ` → ${LOCAL_LABEL[mov.local_destino]}`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <div className="ml-7 w-full">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <p className="text-gray-700 font-medium">📦 Nenhuma Movimentação</p>
                  <p className="text-sm text-gray-600 mt-1">Ainda não houve transferências ou vendas desta ordem</p>
                </div>
              </div>
            </div>
          )}

          {/* PRODUÇÃO - TERCEIRO (MAIS ANTIGO) */}
          {lotes.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={20} className="text-blue-600" />
                <h3 className="font-semibold text-gray-800">Produção</h3>
              </div>
              <div className="ml-7 space-y-3 pb-4 border-l-2 border-gray-200 pl-4">
                {lotes.map(lote => {
                  const tempoProducao = lote.hora_inicio_prod && lote.hora_fim_prod
                    ? Math.round((new Date(lote.hora_fim_prod).getTime() - new Date(lote.hora_inicio_prod).getTime()) / (1000 * 60))
                    : null

                  return (
                    <div key={lote.id} className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                      <div className="mb-2">
                        <p className="font-medium text-gray-800">{lote.codigo_qr}</p>
                        <p className="text-sm text-gray-600 mt-1">👤 Produzido por: <strong>{lote.produzido_por}</strong></p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500">Início:</p>
                          <p className="font-medium text-gray-800">
                            {lote.hora_inicio_prod ? new Date(lote.hora_inicio_prod).toLocaleString('pt-BR') : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Fim:</p>
                          <p className="font-medium text-gray-800">
                            {lote.hora_fim_prod ? new Date(lote.hora_fim_prod).toLocaleString('pt-BR') : '-'}
                          </p>
                        </div>
                      </div>
                      {tempoProducao && (
                        <div className="mt-2 pt-2 border-t border-blue-100 flex items-center gap-1 text-blue-700 text-xs font-semibold">
                          <Clock size={14} /> Tempo total: {tempoProducao}min
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-3">
              <div className="ml-7 w-full">
                <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                  <p className="text-amber-700 font-medium">⏳ Pendente de Produção</p>
                  <p className="text-sm text-amber-600 mt-1">Esta ordem ainda não foi iniciada na produção</p>
                </div>
              </div>
            </div>
          )}

          {/* RESUMO */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <p className="text-xs text-gray-500 mb-2">Informações da Ordem</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 text-xs">Solicitado por:</p>
                <p className="font-medium text-gray-800">{ordem.solicitado_por}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Data da Solicitação:</p>
                <p className="font-medium text-gray-800">{new Date(ordem.data_solicitacao + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Data de Entrega:</p>
                <p className="font-medium text-gray-800">{new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Total de Etiquetas:</p>
                <p className="font-medium text-gray-800">{lotes.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
