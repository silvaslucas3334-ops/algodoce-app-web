'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  PlayCircle,
  PackageCheck,
  ClipboardList,
  CheckCircle2,
  Truck,
  PackageOpen,
  TrendingDown,
  RotateCcw,
  LucideIcon,
} from 'lucide-react'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-amber-100 text-amber-700' },
  em_producao: { label: 'Em produção', color: 'bg-blue-100 text-blue-700' },
  concluida: { label: 'Concluída', color: 'bg-green-100 text-green-700' },
  cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500' },
}

interface TimelineEvento {
  timestamp: string
  titulo: string
  descricao?: string
  pessoa?: string
  etiquetas?: string[]
  cor: string
  Icone: LucideIcon
}

// Algumas colunas (ordens_producao.hora_inicio_prod, romaneios.criado_em/confirmado_em)
// são "timestamp without time zone" mas guardam instantes UTC (gravados via
// toISOString()). Sem sufixo de fuso, o Postgrest devolve a string "pelada" e o
// Date do JS interpreta como horário local do navegador, deslocando o evento.
function parseUTC(raw: string): string {
  const temFuso = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
  return new Date(temFuso ? raw : `${raw}Z`).toISOString()
}

function agruparPorChave<T>(items: T[], chave: (item: T) => string): T[][] {
  const grupos = new Map<string, T[]>()
  items.forEach((item) => {
    const k = chave(item)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(item)
  })
  return Array.from(grupos.values())
}

function labelLocal(local: string | null) {
  if (!local) return 'Desconhecido'
  return LOCAL_LABEL[local] || local
}

function montarTimeline(
  ordem: any,
  lotes: any[],
  movimentacoes: any[],
  romaneios: any[],
  usuariosMap: Record<string, string>
): TimelineEvento[] {
  const eventos: TimelineEvento[] = []
  const loteMap = new Map(lotes.map((l) => [l.id, l]))

  // 1. Ordem criada
  eventos.push({
    timestamp: ordem.created_at,
    titulo: 'Ordem criada',
    pessoa: ordem.solicitado_por,
    cor: 'border-slate-300 bg-slate-50 text-slate-700',
    Icone: FileText,
  })

  // 2. Ordem iniciada em produção
  if (ordem.hora_inicio_prod) {
    eventos.push({
      timestamp: parseUTC(ordem.hora_inicio_prod),
      titulo: 'Ordem iniciada em produção',
      cor: 'border-blue-300 bg-blue-50 text-blue-700',
      Icone: PlayCircle,
    })
  }

  // 3. Produção concluída (etiquetas geradas), agrupado por instante + quem produziu
  const lotesComFim = lotes.filter((l) => l.hora_fim_prod)
  agruparPorChave(lotesComFim, (l) => `${l.hora_fim_prod}-${l.produzido_por}`).forEach((grupo) => {
    eventos.push({
      timestamp: grupo[0].hora_fim_prod,
      titulo: `Produção concluída — ${grupo.length} etiqueta${grupo.length > 1 ? 's' : ''} gerada${grupo.length > 1 ? 's' : ''}`,
      pessoa: grupo[0].produzido_por,
      etiquetas: grupo.map((l) => l.codigo_qr),
      cor: 'border-green-300 bg-green-50 text-green-700',
      Icone: PackageCheck,
    })
  })

  // 4. Romaneios: criação (rascunho) e confirmação (enviado), por lote encontrado em linhas[].etiquetas_selecionadas
  const loteIds = new Set(lotes.map((l) => l.id))
  const romaneiosRelevantes = romaneios.filter((r) =>
    (r.linhas || []).some((linha: any) => (linha.etiquetas_selecionadas || []).some((id: string) => loteIds.has(id)))
  )

  romaneiosRelevantes.forEach((rom) => {
    const etiquetasDoRomaneio = new Set<string>()
    ;(rom.linhas || []).forEach((linha: any) => {
      ;(linha.etiquetas_selecionadas || []).forEach((id: string) => {
        if (loteIds.has(id)) etiquetasDoRomaneio.add(id)
      })
    })
    const tags = Array.from(etiquetasDoRomaneio).map((id) => loteMap.get(id)?.codigo_qr).filter(Boolean) as string[]

    if (tags.length === 0) return

    eventos.push({
      timestamp: parseUTC(rom.criado_em),
      titulo: `Incluída em romaneio (rascunho) — ${labelLocal(rom.unidade_destino)}`,
      pessoa: rom.criado_por ? usuariosMap[rom.criado_por] : undefined,
      etiquetas: tags,
      cor: 'border-amber-300 bg-amber-50 text-amber-700',
      Icone: ClipboardList,
    })

    if (rom.confirmado_em) {
      eventos.push({
        timestamp: parseUTC(rom.confirmado_em),
        titulo: `Romaneio confirmado (enviado) — ${labelLocal(rom.unidade_destino)}`,
        pessoa: rom.confirmado_por ? usuariosMap[rom.confirmado_por] : undefined,
        etiquetas: tags,
        cor: 'border-amber-400 bg-amber-50 text-amber-800',
        Icone: CheckCircle2,
      })
    }
  })

  // 5. Movimentações de estoque (transferência, entrada, saída, reversão)
  agruparPorChave(
    movimentacoes,
    (m) => `${m.created_at}-${m.tipo}-${m.local_origem}-${m.local_destino}-${m.registrado_por}-${m.estornado_de || ''}`
  ).forEach((grupo) => {
    const mov = grupo[0]
    const tags = grupo.map((m) => loteMap.get(m.lote_id)?.codigo_qr).filter(Boolean) as string[]
    const plural = grupo.length > 1 ? 's' : ''

    if (mov.estornado_de) {
      eventos.push({
        timestamp: mov.created_at,
        titulo: `Reversão de baixa — ${grupo.length} etiqueta${plural}`,
        descricao: mov.justificativa ? `Justificativa: "${mov.justificativa}"` : undefined,
        pessoa: mov.registrado_por,
        etiquetas: tags,
        cor: 'border-emerald-300 bg-emerald-50 text-emerald-700',
        Icone: RotateCcw,
      })
      return
    }

    if (mov.tipo === 'transferencia') {
      const titulo =
        mov.local_origem === 'cozinha'
          ? `Enviada da cozinha → ${labelLocal(mov.local_destino)}`
          : mov.local_destino === 'cozinha'
          ? `Devolução para cozinha`
          : `Transferência para ${labelLocal(mov.local_destino)}`
      eventos.push({
        timestamp: mov.created_at,
        titulo: `${titulo} — ${grupo.length} etiqueta${plural}`,
        pessoa: mov.registrado_por,
        etiquetas: tags,
        cor: 'border-cyan-300 bg-cyan-50 text-cyan-700',
        Icone: Truck,
      })
    } else if (mov.tipo === 'entrada') {
      eventos.push({
        timestamp: mov.created_at,
        titulo: `Recebida em ${labelLocal(mov.local_destino)} — ${grupo.length} etiqueta${plural}`,
        pessoa: mov.registrado_por,
        etiquetas: tags,
        cor: 'border-teal-300 bg-teal-50 text-teal-700',
        Icone: PackageOpen,
      })
    } else if (mov.tipo === 'saida') {
      eventos.push({
        timestamp: mov.created_at,
        titulo: `Baixa de estoque (venda/consumo) — ${grupo.length} etiqueta${plural}`,
        pessoa: mov.registrado_por,
        etiquetas: tags,
        cor: 'border-red-300 bg-red-50 text-red-700',
        Icone: TrendingDown,
      })
    }
  })

  return eventos.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

export default function DetalhesOrdemPage() {
  const router = useRouter()
  const params = useParams()
  const [ordem, setOrdem] = useState<any>(null)
  const [lotes, setLotes] = useState<any[]>([])
  const [movimentacoes, setMovimentacoes] = useState<any[]>([])
  const [timeline, setTimeline] = useState<TimelineEvento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarDetalhes()
  }, [params.id])

  async function carregarDetalhes() {
    setLoading(true)
    try {
      const { data: ordemData } = await supabase
        .from('ordens_producao')
        .select('*, produto:produtos(nome, unidade_medida, validade_dias, congelado)')
        .eq('id', params.id)
        .single()

      if (!ordemData) {
        setLoading(false)
        return
      }
      setOrdem(ordemData)

      const { data: lotesData } = await supabase
        .from('lotes_producao')
        .select('*')
        .eq('ordem_id', params.id)
        .order('created_at')

      const lotesFinal = lotesData || []
      setLotes(lotesFinal)

      let movimentacoesFinal: any[] = []
      if (lotesFinal.length > 0) {
        const loteIds = lotesFinal.map((l) => l.id)
        const { data: movData } = await supabase
          .from('movimentacoes_estoque')
          .select('*')
          .in('lote_id', loteIds)
          .order('created_at')

        movimentacoesFinal = movData || []
        setMovimentacoes(movimentacoesFinal)
      }

      // Romaneios: buscar todos e filtrar no cliente pelas etiquetas desta ordem
      // (não há FK direta romaneio -> lote, apenas ids dentro do jsonb `linhas`)
      const { data: romaneiosData } = await supabase
        .from('romaneios')
        .select('id, status, tipo, unidade_destino, criado_em, confirmado_em, criado_por, confirmado_por, linhas')

      // Resolver nomes de usuários (criado_por/confirmado_por são uuid)
      const usuarioIds = Array.from(
        new Set(
          (romaneiosData || [])
            .flatMap((r: any) => [r.criado_por, r.confirmado_por])
            .filter(Boolean)
        )
      )
      let usuariosMap: Record<string, string> = {}
      if (usuarioIds.length > 0) {
        const { data: usuariosData } = await supabase.from('usuarios').select('id, nome').in('id', usuarioIds)
        usuariosMap = Object.fromEntries((usuariosData || []).map((u: any) => [u.id, u.nome]))
      }

      const timelineFinal = montarTimeline(ordemData, lotesFinal, movimentacoesFinal, romaneiosData || [], usuariosMap)
      setTimeline(timelineFinal)
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
              📦 {ordem.quantidade} {ordem.produto?.unidade_medida} · {labelLocal(ordem.loja_destino)}
            </p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_LABEL[ordem.status]?.color}`}>
            {STATUS_LABEL[ordem.status]?.label}
          </span>
        </div>
        {ordem.observacao && <p className="text-sm text-gray-600 italic">Obs: {ordem.observacao}</p>}
      </div>

      {/* TIMELINE ÚNICA DE RASTREABILIDADE */}
      <div className="bg-white rounded-xl p-4 border border-gray-200">
        <h2 className="font-bold text-lg text-gray-800 mb-4">🔍 Rastreabilidade</h2>

        {timeline.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 text-center">
            <p className="text-gray-600">Nenhum evento registrado ainda para esta ordem</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l-2 border-gray-200 space-y-4">
            {timeline.map((evento, idx) => (
              <div key={idx} className="relative">
                <div className={`absolute -left-[29px] top-0 w-6 h-6 rounded-full flex items-center justify-center border-2 bg-white ${evento.cor.split(' ')[0]}`}>
                  <evento.Icone size={13} className={evento.cor.split(' ')[2]} />
                </div>
                <div className={`rounded-lg p-3 border ${evento.cor}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{evento.titulo}</p>
                    <p className="text-xs opacity-70 whitespace-nowrap">
                      {new Date(evento.timestamp).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {evento.pessoa && <p className="text-xs mt-1 opacity-80">👤 {evento.pessoa}</p>}
                  {evento.descricao && <p className="text-xs mt-1 opacity-80">{evento.descricao}</p>}
                  {evento.etiquetas && evento.etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {evento.etiquetas.map((tag) => (
                        <span key={tag} className="text-[10px] font-mono bg-white bg-opacity-60 px-1.5 py-0.5 rounded border border-current border-opacity-30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* RESUMO */}
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 mt-6">
          <p className="text-xs text-gray-500 mb-2">Informações da Ordem</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Solicitado por:</p>
              <p className="font-medium text-gray-800">{ordem.solicitado_por}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Data da Solicitação:</p>
              <p className="font-medium text-gray-800">
                {ordem.data_solicitacao ? new Date(ordem.data_solicitacao + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Data de Entrega:</p>
              <p className="font-medium text-gray-800">
                {ordem.data_entrega ? new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total de Etiquetas:</p>
              <p className="font-medium text-gray-800">{lotes.length}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
