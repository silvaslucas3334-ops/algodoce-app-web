'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import {
  ACAO_COR,
  ACAO_ROTULO,
  buscarHistorico,
  descreverMudancas,
  EventoHistorico,
  NomesReferenciados,
} from '@/lib/financeiro-historico'

interface Props {
  lancamentoId: string
  /** Muda sempre que a tela recarrega o lançamento (ex.: updated_at) — refaz a busca. */
  recarregarChave?: string
  /** created_at do lançamento: mostra a linha "criado em ..." quando o histórico ainda não tem o registro. */
  criadoEm?: string | null
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Linha do tempo de alterações do lançamento. Só o admin vê (a RLS da tabela já garante). */
export default function HistoricoLancamento({ lancamentoId, recarregarChave, criadoEm }: Props) {
  const [eventos, setEventos] = useState<EventoHistorico[]>([])
  const [nomes, setNomes] = useState<NomesReferenciados>({ partes: new Map(), contas: new Map() })
  const [carregando, setCarregando] = useState(true)
  const [indisponivel, setIndisponivel] = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    let cancelado = false
    buscarHistorico(lancamentoId).then((r) => {
      if (cancelado) return
      setEventos(r.eventos)
      setNomes(r.nomes)
      setIndisponivel(r.indisponivel)
      setCarregando(false)
    })
    return () => {
      cancelado = true
    }
  }, [lancamentoId, recarregarChave])

  const temRegistroDeCriacao = eventos.some((e) => e.acao === 'criado')

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <button onClick={() => setAberto((v) => !v)} className="w-full flex items-center justify-between text-left">
        <span className="flex items-center gap-2 font-semibold text-gray-800">
          <History size={16} className="text-gray-500" />
          Histórico{!carregando && !indisponivel ? ` (${eventos.length})` : ''}
        </span>
        {aberto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {aberto && (
        <div className="mt-4">
          {carregando ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : indisponivel ? (
            <p className="text-sm text-gray-400">Histórico indisponível no momento.</p>
          ) : (
            <ol className="space-y-4">
              {eventos.map((e) => {
                const linhas = descreverMudancas(e, nomes)
                return (
                  <li key={e.id} className="border-l-2 border-gray-200 pl-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span>{formatarDataHora(e.em)}</span>
                      <span>·</span>
                      <span className="font-medium text-gray-700">{e.usuario_nome}</span>
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${ACAO_COR[e.acao]}`}>
                        {ACAO_ROTULO[e.acao]}
                        {e.item_nome ? `: ${e.item_nome}` : ''}
                      </span>
                    </div>
                    {linhas.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {linhas.map((l, i) => (
                          <li key={i} className="text-sm text-gray-700">
                            <span className="text-gray-500">{l.rotulo}:</span>{' '}
                            {l.de !== undefined ? (
                              <>
                                <span className="text-gray-400 line-through">{l.de}</span> → <span className="font-medium">{l.para}</span>
                              </>
                            ) : (
                              <span className="font-medium">{l.para}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
              {!temRegistroDeCriacao && criadoEm && (
                <li className="border-l-2 border-gray-200 pl-3 text-xs text-gray-400">
                  {formatarDataHora(criadoEm)} · Lançamento criado (anterior ao histórico, sem mais detalhes)
                </li>
              )}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
