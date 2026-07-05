'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseOFX, detectarPagamentosRecorrentes, formatBRL, PagamentoRecorrente } from '@/lib/ofx'
import { getHoje } from '@/lib/tarefas-utils'
import { X, Upload, Loader, FileText, ChevronDown, ChevronRight } from 'lucide-react'

interface PagamentosOFXModalProps {
  setorId: string // setor Administrativo
  usuariosDoSetor: { id: string; nome: string }[]
  criadoPor: string
  onClose: () => void
  onCreated: () => void
}

function logErro(contexto: string, error: any) {
  console.error(contexto, { message: error?.message, code: error?.code, details: error?.details, hint: error?.hint })
}

export default function PagamentosOFXModal({
  setorId,
  usuariosDoSetor,
  criadoPor,
  onClose,
  onCreated,
}: PagamentosOFXModalProps) {
  const [detectados, setDetectados] = useState<PagamentoRecorrente[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [datas, setDatas] = useState<Record<string, string>>({})
  const [titulos, setTitulos] = useState<Record<string, string>>({})
  const [datasFim, setDatasFim] = useState<Record<string, string>>({})
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [responsavelId, setResponsavelId] = useState(usuariosDoSetor[0]?.id || criadoPor)
  const [analisado, setAnalisado] = useState(false)
  const [nTransacoes, setNTransacoes] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const texto = ev.target?.result as string
        const trans = parseOFX(texto)
        setNTransacoes(trans.length)
        const rec = detectarPagamentosRecorrentes(trans, getHoje())
        setDetectados(rec)
        setSelecionados(new Set(rec.map((r) => r.chave)))
        setDatas(Object.fromEntries(rec.map((r) => [r.chave, r.proximaData])))
        setTitulos(Object.fromEntries(rec.map((r) => [r.chave, `Pagar ${r.nome}`])))
        setDatasFim(Object.fromEntries(rec.map((r) => [r.chave, ''])))
        setAnalisado(true)
      } catch (err) {
        console.error(err)
        setErro('Não foi possível ler este arquivo OFX.')
      }
    }
    reader.readAsText(file)
  }

  function toggle(chave: string) {
    const s = new Set(selecionados)
    s.has(chave) ? s.delete(chave) : s.add(chave)
    setSelecionados(s)
  }

  async function gerar() {
    const alvos = detectados.filter((d) => selecionados.has(d.chave))
    if (alvos.length === 0) {
      setErro('Selecione ao menos um pagamento.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const linhas = alvos.map((d) => ({
        titulo: titulos[d.chave] || `Pagar ${d.nome}`,
        descricao: `Lembrete de pagamento recorrente (média ${formatBRL(d.valorMedio)}, última ${formatBRL(d.valorUltimo)}). Detectado ${d.ocorrencias}x no extrato.`,
        setor_id: setorId,
        responsavel_id: responsavelId,
        foto_obrigatoria: false,
        hora_limite: null,
        frequencia: d.frequencia,
        dias_semana: d.frequencia === 'semanal' ? d.diasSemana : null,
        dia_mes: d.frequencia === 'mensal' ? d.diaMes : null,
        proxima_data: datas[d.chave] || d.proximaData,
        data_inicio: datas[d.chave] || d.proximaData,
        data_fim: datasFim[d.chave] || null,
        ativa: true,
        criado_por: criadoPor,
      }))

      const { error } = await supabase.from('tarefas_recorrencias').insert(linhas)
      if (error) {
        logErro('Erro ao criar recorrências de pagamento:', error)
        setErro('Erro ao salvar: ' + (error.message || 'sem mensagem'))
        setSalvando(false)
        return
      }

      const { error: rpcError } = await supabase.rpc('gerar_tarefas_recorrentes')
      if (rpcError) logErro('Recorrências criadas, mas falhou ao gerar instâncias:', rpcError)

      const tipos = alvos.map((a) => a.frequencia)
      const msg = alvos.length === 1
        ? `Lembrete criado como ${tipos[0]}.`
        : `${alvos.length} lembretes criados.`
      alert(msg)
      onCreated()
      onClose()
    } catch (err: any) {
      logErro('Erro ao gerar lembretes (exceção):', err)
      setErro('Erro ao gerar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">💳 Lembretes de pagamento (OFX)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>
        )}

        {!analisado ? (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Envie o extrato bancário em <strong>.ofx</strong>. O sistema detecta pagamentos
              recorrentes (mesmo beneficiário e valor em meses diferentes) e cria lembretes mensais.
            </p>
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center gap-2 text-gray-600 hover:border-pink-400 cursor-pointer">
              <Upload size={24} />
              <span className="text-sm">Selecionar arquivo .ofx</span>
              <input type="file" accept=".ofx,.OFX,text/plain" onChange={onArquivo} className="hidden" />
            </label>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
              <FileText size={12} /> {nTransacoes} transações lidas · {detectados.length} pagamento(s) recorrente(s) detectado(s)
            </p>

            {detectados.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">
                Nenhum pagamento recorrente identificado (precisa repetir o mesmo beneficiário/valor em meses diferentes).
              </p>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Responsável pelos lembretes</label>
                  <select
                    value={responsavelId}
                    onChange={(e) => setResponsavelId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {usuariosDoSetor.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 mb-4">
                  {detectados.map((d) => {
                    const expandido = expandidos.has(d.chave)
                    return (
                      <div key={d.chave} className="border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            const s = new Set(expandidos)
                            expandido ? s.delete(d.chave) : s.add(d.chave)
                            setExpandidos(s)
                          }}
                          className="w-full flex items-center justify-between gap-2 p-3 hover:bg-gray-50"
                        >
                          <label className="flex items-start gap-2 flex-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selecionados.has(d.chave)}
                              onChange={() => toggle(d.chave)}
                              className="w-4 h-4 rounded mt-0.5"
                            />
                            <div className="flex-1 text-left">
                              <p className="text-sm font-semibold text-gray-800">{d.nome}</p>
                              <p className="text-xs text-gray-500">
                                {formatBRL(d.valorUltimo)} (média {formatBRL(d.valorMedio)}) · {d.ocorrencias}x ·{' '}
                                {d.frequencia === 'diaria' && 'diariamente'}
                                {d.frequencia === 'semanal' &&
                                  `semanal (${d.diasSemana.map((i) => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]).join(', ')})`}
                                {d.frequencia === 'mensal' && `todo dia ${d.diaMes}`}
                              </p>
                            </div>
                          </label>
                          {expandido ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>

                        {expandido && (
                          <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">
                                Título da recorrência
                              </label>
                              <input
                                type="text"
                                value={titulos[d.chave] || ''}
                                onChange={(e) => setTitulos({ ...titulos, [d.chave]: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                placeholder={`Pagar ${d.nome}`}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                  Próximo pagamento
                                </label>
                                <input
                                  type="date"
                                  value={datas[d.chave] || d.proximaData}
                                  onChange={(e) => setDatas({ ...datas, [d.chave]: e.target.value })}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">
                                  Fim da recorrência (opcional)
                                </label>
                                <input
                                  type="date"
                                  value={datasFim[d.chave] || ''}
                                  onChange={(e) => setDatasFim({ ...datasFim, [d.chave]: e.target.value })}
                                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={gerar}
                  disabled={salvando}
                  className="w-full bg-green-600 text-white rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                >
                  {salvando ? <Loader size={18} className="animate-spin" /> : `Criar ${selecionados.size} lembrete(s)`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
