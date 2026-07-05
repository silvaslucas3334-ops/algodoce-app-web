'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Tarefa } from '@/lib/types'
import { X, Save, Loader } from 'lucide-react'

interface EditarRecorrenciaModalProps {
  tarefa: Tarefa
  recorrencia: any // TarefaRecorrencia
  onClose: () => void
  onSaved: () => void
}

function logErro(contexto: string, error: any) {
  console.error(contexto, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  })
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function EditarRecorrenciaModal({
  tarefa,
  recorrencia,
  onClose,
  onSaved,
}: EditarRecorrenciaModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false)
  const [form, setForm] = useState({
    titulo: recorrencia.titulo,
    frequencia: recorrencia.frequencia,
    diasSemana: recorrencia.dias_semana || [],
    diaMes: recorrencia.dia_mes,
    horaLimite: recorrencia.hora_limite ? recorrencia.hora_limite.substring(0, 5) : '',
    fotoObrigatoria: recorrencia.foto_obrigatoria,
    dataFim: recorrencia.data_fim || '',
  })

  function toggleDia(d: number) {
    setForm((f) => ({
      ...f,
      diasSemana: f.diasSemana.includes(d)
        ? f.diasSemana.filter((x: number) => x !== d)
        : [...f.diasSemana, d].sort((a: number, b: number) => a - b),
    }))
  }

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro('Título é obrigatório')
      return
    }
    if (form.frequencia === 'semanal' && form.diasSemana.length === 0) {
      setErro('Selecione ao menos um dia da semana')
      return
    }

    setSalvando(true)
    setErro('')

    try {
      const { error: updateError } = await supabase
        .from('tarefas_recorrencias')
        .update({
          titulo: form.titulo.trim(),
          frequencia: form.frequencia,
          dias_semana: form.frequencia === 'semanal' ? form.diasSemana : null,
          dia_mes: form.frequencia === 'mensal' ? form.diaMes : null,
          hora_limite: form.horaLimite || null,
          foto_obrigatoria: form.fotoObrigatoria,
          data_fim: form.dataFim || null,
        })
        .eq('id', recorrencia.id)

      if (updateError) {
        logErro('Erro ao atualizar recorrência:', updateError)
        setErro('Erro ao salvar: ' + (updateError.message || 'sem mensagem'))
        setSalvando(false)
        return
      }

      // Regenera instâncias futuras (função idempotente)
      const { error: rpcError } = await supabase.rpc('gerar_tarefas_recorrentes')
      if (rpcError) logErro('Recorrência atualizada, mas falhou ao regenerar instâncias:', rpcError)

      onSaved()
      onClose()
    } catch (err: any) {
      logErro('Erro ao editar recorrência (exceção):', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  async function cancelarRecorrencia() {
    if (!confirm('Desativar recorrência?\n\nIsso cancelará TODAS as ocorrências futuras não concluídas desta recorrência.')) {
      return
    }

    setSalvando(true)
    setErro('')
    setConfirmandoCancelamento(false)

    try {
      // 1. Busca todas as tarefas ativas (não concluídas/canceladas) desta recorrência
      const { data: tarefasAtivas, error: fetchError } = await supabase
        .from('tarefas')
        .select('id')
        .eq('recorrencia_id', recorrencia.id)
        .not('status', 'in', '(concluida,cancelada)')

      if (fetchError) {
        logErro('Erro ao buscar tarefas para cancelamento:', fetchError)
        setErro('Erro ao buscar tarefas: ' + (fetchError.message || 'sem mensagem'))
        setSalvando(false)
        return
      }

      // 2. Marca a recorrência como inativa
      const { error: updateRecError } = await supabase
        .from('tarefas_recorrencias')
        .update({
          ativa: false,
        })
        .eq('id', recorrencia.id)

      if (updateRecError) {
        logErro('Erro ao desativar recorrência:', updateRecError)
        setErro('Erro ao desativar: ' + (updateRecError.message || 'sem mensagem'))
        setSalvando(false)
        return
      }

      // 3. Cancela as tarefas ativas
      if (tarefasAtivas && tarefasAtivas.length > 0) {
        const tarefaIds = tarefasAtivas.map((t) => t.id)
        const { error: cancelError } = await supabase
          .from('tarefas')
          .update({
            status: 'cancelada',
            updated_at: new Date().toISOString(),
          })
          .in('id', tarefaIds)

        if (cancelError) {
          logErro('Erro ao cancelar tarefas:', cancelError)
          setErro('Recorrência desativada, mas falhou ao cancelar tarefas: ' + (cancelError.message || 'sem mensagem'))
          setSalvando(false)
          return
        }

        // 4. Registra no histórico de cada tarefa
        const historicoEntradas = tarefaIds.map((tarefaId) => ({
          tarefa_id: tarefaId,
          alteracao_tipo: 'cancelamento' as const,
          dados_json: { motivo: 'Cancelamento da recorrência' },
          registrado_por: recorrencia.criado_por,
        }))

        const { error: histError } = await supabase
          .from('tarefas_historico')
          .insert(historicoEntradas)

        if (histError) logErro('Recorrência cancelada, mas falhou ao gravar histórico:', histError)
      }

      alert(`Recorrência desativada. ${tarefasAtivas?.length || 0} tarefa(s) futura(s) cancelada(s).`)
      onSaved()
      onClose()
    } catch (err: any) {
      logErro('Erro ao cancelar recorrência (exceção):', err)
      setErro('Erro ao cancelar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Editar Recorrência</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Muda o título de TODAS as instâncias futuras</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Frequência</label>
            <div className="flex gap-2">
              {(['diaria', 'semanal', 'mensal'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForm({ ...form, frequencia: f })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    form.frequencia === f
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {form.frequencia === 'semanal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dias da semana</label>
              <div className="flex gap-1 flex-wrap">
                {DIAS.map((d, idx) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDia(idx)}
                    className={`w-10 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      form.diasSemana.includes(idx)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.frequencia === 'mensal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dia do mês</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.diaMes}
                onChange={(e) => setForm({ ...form, diaMes: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora limite</label>
            <input
              type="time"
              value={form.horaLimite}
              onChange={(e) => setForm({ ...form, horaLimite: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fim da recorrência (opcional)</label>
            <input
              type="date"
              value={form.dataFim}
              onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Deixe vazio para contínua; instâncias futuras serão regeneradas</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit_foto_obrigatoria"
              checked={form.fotoObrigatoria}
              onChange={(e) => setForm({ ...form, fotoObrigatoria: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="edit_foto_obrigatoria" className="text-sm font-medium text-gray-700">
              Exigir foto para concluir
            </label>
          </div>

          {!confirmandoCancelamento ? (
            <>
              <div className="flex gap-3">
                <button
                  onClick={salvar}
                  disabled={salvando}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                >
                  {salvando ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                  Salvar
                </button>
                <button
                  onClick={onClose}
                  disabled={salvando}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  Fechar
                </button>
              </div>

              <button
                onClick={() => setConfirmandoCancelamento(true)}
                disabled={salvando}
                className="w-full py-2 rounded-lg font-semibold text-sm bg-red-50 text-red-600 hover:bg-red-100 transition-all disabled:opacity-50 border border-red-200"
              >
                🗑️ Cancelar recorrência
              </button>
            </>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-red-800 mb-1">
                  ⚠️ Cancelar esta recorrência?
                </p>
                <p className="text-xs text-red-700">
                  Isso desativará a recorrência e cancelará TODAS as instâncias futuras não concluídas. Tarefas já concluídas serão mantidas no histórico.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={cancelarRecorrencia}
                  disabled={salvando}
                  className="flex-1 bg-red-600 text-white rounded-lg py-2 font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {salvando ? <Loader size={14} className="animate-spin inline mr-1" /> : ''}
                  Sim, cancelar
                </button>
                <button
                  onClick={() => setConfirmandoCancelamento(false)}
                  disabled={salvando}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold text-sm hover:bg-gray-200 disabled:opacity-50"
                >
                  Não, voltar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
