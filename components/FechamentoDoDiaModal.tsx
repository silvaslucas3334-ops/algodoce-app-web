'use client'
import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Loader, LogOut, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { LOCAL_LABEL } from '@/lib/constants'
import { MOTIVOS_BAIXA, MotivoBaixa, motivoPadrao } from '@/lib/estoque-baixa'
import { carregarContagem, LinhaContagem, registrarFechamento } from '@/lib/estoque-fechamento'

interface Props {
  local: string
  /** Bloqueio das 18h: sem botão de fechar — só sai concluindo a contagem. */
  obrigatorio?: boolean
  onFechar?: () => void
  onConcluido: () => void
}

/**
 * Fechamento do dia (inventário diário). Um componente, duas entradas: o botão
 * "Fechamento do dia" no menu do Estoque (voluntário) e o bloqueio das 18h
 * (components/FechamentoGate.tsx), que abre este modal por cima de qualquer tela.
 * Os campos de contagem começam VAZIOS de propósito: cada produto precisa ser
 * contado (ou marcado "igual ao sistema"), senão o inventário vira só um "confirmar".
 */
export default function FechamentoDoDiaModal({ local, obrigatorio = false, onFechar, onConcluido }: Props) {
  const { usuario, logout } = useAuth()
  const [linhas, setLinhas] = useState<LinhaContagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [contagens, setContagens] = useState<Record<string, string>>({})
  const [motivos, setMotivos] = useState<Record<string, MotivoBaixa>>({})
  const [enviando, setEnviando] = useState(false)
  const [falhaCarga, setFalhaCarga] = useState(false)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setFalhaCarga(false)
    setErro('')
    carregarContagem(local)
      .then((dados) => { if (!cancelado) setLinhas(dados) })
      .catch((e) => {
        if (cancelado) return
        setFalhaCarga(true)
        setErro('Não foi possível carregar o estoque: ' + (e?.message || 'erro desconhecido'))
      })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [local, tentativa])

  const numero = (produtoId: string): number | null => {
    const bruto = contagens[produtoId]
    if (bruto === undefined || bruto.trim() === '') return null
    const n = Number(bruto)
    return Number.isInteger(n) && n >= 0 ? n : null
  }

  const resumo = useMemo(() => {
    let contados = 0
    let abaixar = 0
    for (const l of linhas) {
      const n = numero(l.produtoId)
      if (n === null) continue
      contados += 1
      if (n < l.esperado) abaixar += l.esperado - n
    }
    return { contados, abaixar }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, contagens])

  // Falha ao carregar o estoque nunca pode virar "nada a contar": sem a lista não dá pra confirmar.
  const tudoContado = !falhaCarga && (linhas.length === 0 || resumo.contados === linhas.length)

  async function confirmar() {
    if (!usuario || !tudoContado) return
    const mensagem =
      resumo.abaixar > 0
        ? `Confirmar o fechamento? ${resumo.abaixar} etiqueta(s) serão baixadas pela diferença da contagem.`
        : 'Confirmar o fechamento? A contagem bate com o sistema.'
    if (!window.confirm(mensagem)) return

    setEnviando(true)
    setErro('')
    try {
      const r = await registrarFechamento({
        local,
        usuarioId: usuario.id,
        usuarioNome: usuario.nome || usuario.email || 'Usuário',
        itens: linhas.map((l) => ({
          produtoId: l.produtoId,
          esperado: l.esperado,
          contado: numero(l.produtoId) as number,
          motivo: motivos[l.produtoId] || motivoPadrao(local),
        })),
      })
      if (r.avisos.length > 0) alert(r.avisos.join('\n'))
      onConcluido()
    } catch (e: any) {
      console.error('Erro ao registrar fechamento:', e)
      setErro('Não foi possível concluir: ' + (e?.message || 'erro desconhecido') + '. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  // agrupa por categoria mantendo a ordem
  const grupos = useMemo(() => {
    const mapa = new Map<string, LinhaContagem[]>()
    linhas.forEach((l) => mapa.set(l.categoria, [...(mapa.get(l.categoria) || []), l]))
    return Array.from(mapa.entries())
  }, [linhas])

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col ${obrigatorio ? 'bg-white' : 'bg-black/60 items-center justify-center p-0 sm:p-4'}`}>
      <div className={`flex flex-col bg-white ${obrigatorio ? 'flex-1 min-h-0' : 'w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl shadow-xl'}`}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-start gap-3">
          <ClipboardCheck size={22} className="text-pink-700 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-800">Fechamento do dia · {LOCAL_LABEL[local] || local}</h2>
            <p className="text-xs text-gray-500">
              Conte o que há na prateleira e informe abaixo. A diferença para o sistema vira baixa.
            </p>
          </div>
          {!obrigatorio && onFechar && (
            <button onClick={onFechar} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
              <X size={22} />
            </button>
          )}
          {obrigatorio && (
            <button
              onClick={() => logout()}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 flex-shrink-0"
              title="Sair da conta"
            >
              <LogOut size={14} /> Sair
            </button>
          )}
        </div>

        {obrigatorio && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
            🔒 O sistema fica bloqueado até o fechamento do dia ser concluído.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {carregando ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader size={18} className="animate-spin" /> Carregando estoque...
            </div>
          ) : falhaCarga ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-700 mb-3">{erro}</p>
              <button onClick={() => setTentativa((t) => t + 1)} className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                Tentar de novo
              </button>
            </div>
          ) : linhas.length === 0 ? (
            <p className="text-center text-gray-500 py-12">Não há etiquetas na prateleira desta loja. Basta registrar o fechamento.</p>
          ) : (
            <div className="space-y-5">
              {grupos.map(([categoria, itens]) => (
                <section key={categoria}>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{categoria}</h3>
                  <div className="space-y-2">
                    {itens.map((l) => {
                      const n = numero(l.produtoId)
                      const falta = n !== null ? l.esperado - n : 0
                      return (
                        <div key={l.produtoId} className={`border rounded-lg p-3 ${n === null ? 'border-gray-200' : falta > 0 ? 'border-red-200 bg-red-50/40' : n > l.esperado ? 'border-amber-300 bg-amber-50/50' : 'border-green-200 bg-green-50/40'}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-800 truncate">{l.nome}</p>
                              <p className="text-xs text-gray-500">No sistema: <strong>{l.esperado}</strong> {l.esperado === 1 ? 'etiqueta' : 'etiquetas'}</p>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              value={contagens[l.produtoId] ?? ''}
                              onChange={(e) => setContagens((c) => ({ ...c, [l.produtoId]: e.target.value }))}
                              placeholder="contei"
                              aria-label={`Quantidade contada de ${l.nome}`}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-2 text-center text-lg font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => setContagens((c) => ({ ...c, [l.produtoId]: String(l.esperado) }))}
                              className="text-xs px-2 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                            >
                              = sistema
                            </button>
                          </div>
                          {n !== null && falta > 0 && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-red-700">Faltam {falta} → serão baixadas</span>
                              <select
                                value={motivos[l.produtoId] || motivoPadrao(local)}
                                onChange={(e) => setMotivos((m) => ({ ...m, [l.produtoId]: e.target.value as MotivoBaixa }))}
                                className="text-xs border border-gray-300 rounded-lg px-2 py-1 bg-white"
                                aria-label={`Motivo da baixa de ${l.nome}`}
                              >
                                {MOTIVOS_BAIXA.map((m) => (
                                  <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {n !== null && n > l.esperado && (
                            <p className="mt-2 text-xs text-amber-800">
                              Você contou {n - l.esperado} a mais que o sistema. Confira se há etiqueta que não foi recebida — o fechamento não cria etiqueta.
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 bg-white">
          {erro && !falhaCarga && <p className="text-sm text-red-700 mb-2">{erro}</p>}
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-gray-500">
              {linhas.length > 0 && <span>{resumo.contados} de {linhas.length} produtos contados</span>}
              {resumo.abaixar > 0 && <span className="text-red-700 font-semibold"> · {resumo.abaixar} etiqueta(s) a baixar</span>}
            </p>
            <button
              onClick={confirmar}
              disabled={!tudoContado || enviando || carregando}
              className="bg-pink-700 text-white rounded-lg px-5 py-3 font-semibold disabled:opacity-40 hover:bg-pink-800 flex items-center gap-2"
            >
              {enviando && <Loader size={16} className="animate-spin" />}
              Confirmar fechamento
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
