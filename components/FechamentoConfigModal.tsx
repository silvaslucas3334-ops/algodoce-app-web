'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { LOCAL_LABEL } from '@/lib/constants'
import { ROTULO_MOTIVO } from '@/lib/estoque-baixa'
import { buscarStatusFechamento, dispensarFechamento, StatusFechamento } from '@/lib/estoque-fechamento'

interface Config {
  local: 'loja1' | 'loja2'
  bloqueio_ativo: boolean
  hora_corte: string // 'HH:MM:SS'
  dias_sem_exigencia: number[]
}

interface UltimoFechamento {
  data: string
  criado_por_nome: string
  total_baixado: number
  dispensado: boolean
  motivo_dispensa: string | null
  created_at: string
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const somarDias = (iso: string, d: number) => {
  const [a, m, dia] = iso.split('-').map(Number)
  const x = new Date(a, m - 1, dia + d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Admin: liga/desliga o bloqueio por loja, define hora de corte e dias sem exigência, dispensa o dia, e vê perdas por motivo. */
export default function FechamentoConfigModal({ onFechar }: { onFechar: () => void }) {
  const { usuario } = useAuth()
  const [configs, setConfigs] = useState<Config[]>([])
  const [status, setStatus] = useState<Record<string, StatusFechamento | null>>({})
  const [ultimos, setUltimos] = useState<Record<string, UltimoFechamento | null>>({})
  const [perdas, setPerdas] = useState<{ local: string; motivo: string | null; quantidade: number }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const { data: cfgs, error } = await supabase.from('estoque_config').select('*').order('local')
      if (error) throw error
      const lista = (cfgs || []) as Config[]
      setConfigs(lista)

      const novosStatus: Record<string, StatusFechamento | null> = {}
      const novosUltimos: Record<string, UltimoFechamento | null> = {}
      await Promise.all(
        lista.map(async (c) => {
          novosStatus[c.local] = await buscarStatusFechamento(c.local)
          const { data } = await supabase
            .from('estoque_fechamentos')
            .select('data, criado_por_nome, total_baixado, dispensado, motivo_dispensa, created_at')
            .eq('local', c.local)
            .order('created_at', { ascending: false })
            .limit(1)
          novosUltimos[c.local] = (data && data[0]) || null
        })
      )
      setStatus(novosStatus)
      setUltimos(novosUltimos)

      const desde = somarDias(hojeSP(), -30)
      const { data: baixas, error: erroBaixas } = await supabase.from('estoque_baixas_por_dia').select('local, dia, motivo, quantidade').gte('dia', desde)
      if (erroBaixas) throw erroBaixas
      const agregado = new Map<string, { local: string; motivo: string | null; quantidade: number }>()
      ;(baixas || []).forEach((b: any) => {
        const chave = `${b.local}|${b.motivo || ''}`
        const atual = agregado.get(chave) || { local: b.local, motivo: b.motivo, quantidade: 0 }
        atual.quantidade += b.quantidade
        agregado.set(chave, atual)
      })
      setPerdas(Array.from(agregado.values()))
    } catch (e: any) {
      console.error(e)
      setErro('Erro ao carregar: ' + (e?.message || 'desconhecido') + ' (o SQL da fase 4 já foi rodado?)')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function atualizar(local: string, campos: Partial<Config>) {
    setSalvando(local)
    try {
      const { error } = await supabase
        .from('estoque_config')
        .update({ ...campos, atualizado_por: usuario?.id, updated_at: new Date().toISOString() })
        .eq('local', local)
      if (error) throw error
      await carregar()
    } catch (e: any) {
      alert('Erro ao salvar: ' + (e?.message || 'desconhecido'))
    } finally {
      setSalvando(null)
    }
  }

  async function dispensar(local: string) {
    const motivo = window.prompt(`Dispensar o fechamento de hoje de ${LOCAL_LABEL[local]}? Informe o motivo (fica registrado):`)
    if (!motivo || !motivo.trim() || !usuario) return
    setSalvando(local)
    try {
      await dispensarFechamento({ local, usuarioId: usuario.id, usuarioNome: usuario.nome || usuario.email, motivo: motivo.trim() })
      await carregar()
    } catch (e: any) {
      alert('Erro ao dispensar: ' + (e?.message || 'desconhecido'))
    } finally {
      setSalvando(null)
    }
  }

  const motivos = Array.from(new Set(perdas.map((p) => p.motivo || '')))
  const qtd = (local: string, motivo: string) => perdas.find((p) => p.local === local && (p.motivo || '') === motivo)?.quantidade || 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Fechamento do dia — configuração e perdas</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600" aria-label="Fechar"><X size={22} /></button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400"><Loader size={18} className="animate-spin" /> Carregando...</div>
        ) : erro ? (
          <p className="text-sm text-red-700">{erro}</p>
        ) : (
          <div className="space-y-5">
            {configs.map((c) => {
              const st = status[c.local]
              const ultimo = ultimos[c.local]
              const ocupado = salvando === c.local
              return (
                <section key={c.local} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="font-bold text-gray-800">{LOCAL_LABEL[c.local]}</h3>
                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={c.bloqueio_ativo}
                        disabled={ocupado}
                        onChange={(e) => atualizar(c.local, { bloqueio_ativo: e.target.checked })}
                        className="w-5 h-5 accent-pink-700"
                      />
                      Bloqueio {c.bloqueio_ativo ? <span className="text-red-700">LIGADO</span> : <span className="text-gray-500">desligado</span>}
                    </label>
                  </div>

                  <p className="text-sm text-gray-600 mb-3">
                    Hoje: {st == null ? '— (não foi possível consultar)' : st.pendente ? <strong className="text-amber-700">fechamento pendente</strong> : <strong className="text-green-700">em dia</strong>}
                    {ultimo && (
                      <span className="block text-xs text-gray-500 mt-0.5">
                        Último: {new Date(ultimo.created_at).toLocaleString('pt-BR')} por {ultimo.criado_por_nome}
                        {ultimo.dispensado ? ` (dispensado: ${ultimo.motivo_dispensa})` : ` · ${ultimo.total_baixado} baixada(s)`}
                      </span>
                    )}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <label className="text-sm text-gray-700 flex items-center gap-2">
                      Hora de corte
                      <input
                        type="time"
                        defaultValue={c.hora_corte.slice(0, 5)}
                        disabled={ocupado}
                        onBlur={(e) => { if (e.target.value && e.target.value !== c.hora_corte.slice(0, 5)) atualizar(c.local, { hora_corte: e.target.value }) }}
                        className="border border-gray-300 rounded-lg px-2 py-1"
                      />
                    </label>
                    <div className="text-sm text-gray-700">
                      <span className="mr-2">Sem exigência:</span>
                      {DIAS.map((nome, dow) => {
                        const marcado = c.dias_sem_exigencia.includes(dow)
                        return (
                          <label key={dow} className="inline-flex items-center gap-1 mr-2 text-xs">
                            <input
                              type="checkbox"
                              checked={marcado}
                              disabled={ocupado}
                              onChange={() =>
                                atualizar(c.local, {
                                  dias_sem_exigencia: marcado ? c.dias_sem_exigencia.filter((d) => d !== dow) : [...c.dias_sem_exigencia, dow].sort(),
                                })
                              }
                            />
                            {nome}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-3">
                    <button
                      onClick={() => dispensar(c.local)}
                      disabled={ocupado}
                      className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Dispensar o fechamento de hoje
                    </button>
                  </div>
                </section>
              )
            })}

            <section>
              <h3 className="font-bold text-gray-800 mb-2">Baixas por motivo — últimos 30 dias</h3>
              {perdas.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma baixa no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200">
                        <th className="py-2 pr-3">Motivo</th>
                        <th className="py-2 px-3 text-right">{LOCAL_LABEL.loja1}</th>
                        <th className="py-2 px-3 text-right">{LOCAL_LABEL.loja2}</th>
                        <th className="py-2 pl-3 text-right">{LOCAL_LABEL.cozinha}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {motivos.map((m) => (
                        <tr key={m || 'sem'} className="border-b border-gray-100">
                          <td className="py-2 pr-3 text-gray-800">{m ? ROTULO_MOTIVO[m] || m : <span className="text-gray-400">Sem motivo (antes da fase 4)</span>}</td>
                          <td className="py-2 px-3 text-right">{qtd('loja1', m)}</td>
                          <td className="py-2 px-3 text-right">{qtd('loja2', m)}</td>
                          <td className="py-2 pl-3 text-right">{qtd('cozinha', m)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2">Em etiquetas (1 etiqueta = 1 unidade). Baixas revertidas não entram. Valor em R$ vem numa fase posterior.</p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
