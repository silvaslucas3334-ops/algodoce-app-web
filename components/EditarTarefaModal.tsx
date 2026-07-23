'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Tarefa, TarefaEnvolvido } from '@/lib/types'
import { normalizarTitulo, colapsarEspacos } from '@/lib/tarefas-utils'
import { X, Save } from 'lucide-react'
import SeletorPessoas from './SeletorPessoas'

interface EditarTarefaModalProps {
  tarefa: Tarefa
  usuariosDoSetor: { id: string; nome: string }[]
  envolvidosAtuais?: TarefaEnvolvido[]
  usuarioAtualId: string
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

export default function EditarTarefaModal({
  tarefa,
  usuariosDoSetor,
  envolvidosAtuais = [],
  usuarioAtualId,
  onClose,
  onSaved,
}: EditarTarefaModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    titulo: tarefa.titulo,
    descricao: tarefa.descricao || '',
    responsavel_id: tarefa.responsavel_atual_id,
    data_vencimento: tarefa.data_vencimento,
    hora_limite: tarefa.hora_limite ? tarefa.hora_limite.substring(0, 5) : '',
    foto_obrigatoria: tarefa.foto_obrigatoria,
  })
  const [titulosSetor, setTitulosSetor] = useState<{ titulo: string; count: number }[]>([])
  const envolvidoIdsOriginais = envolvidosAtuais.map((e) => e.usuario_id).sort()
  const [envolvidoIds, setEnvolvidoIds] = useState<string[]>(envolvidoIdsOriginais)

  useEffect(() => {
    async function carregarTitulos() {
      const [{ data: tData }, { data: rData }] = await Promise.all([
        supabase.from('tarefas').select('titulo').eq('setor_id', tarefa.setor_id),
        supabase
          .from('tarefas_recorrencias')
          .select('titulo')
          .eq('setor_id', tarefa.setor_id)
          .eq('ativa', true),
      ])
      const contagem: Record<string, number> = {}
      ;[...(tData || []), ...(rData || [])].forEach((row: any) => {
        const t = (row.titulo || '').trim()
        if (!t) return
        contagem[t] = (contagem[t] || 0) + 1
      })
      setTitulosSetor(
        Object.entries(contagem)
          .map(([titulo, count]) => ({ titulo, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
      )
    }
    carregarTitulos()
  }, [tarefa.setor_id])

  // Chips só após 3+ caracteres, para não listar o setor inteiro.
  const tituloNorm = normalizarTitulo(form.titulo)
  const chips =
    tituloNorm.length >= 3
      ? titulosSetor.filter((t) => normalizarTitulo(t.titulo).includes(tituloNorm))
      : []

  async function salvar() {
    if (!form.titulo.trim()) {
      setErro('Título é obrigatório')
      return
    }
    if (!form.responsavel_id) {
      setErro('Selecione um responsável')
      return
    }

    const tituloFinal = colapsarEspacos(form.titulo)
    const horaFinal = form.hora_limite || null

    // Diff para o histórico
    const mudancas: Record<string, { de: any; para: any }> = {}
    if (tituloFinal !== tarefa.titulo)
      mudancas.titulo = { de: tarefa.titulo, para: tituloFinal }
    if ((form.descricao.trim() || null) !== (tarefa.descricao || null))
      mudancas.descricao = { de: tarefa.descricao || null, para: form.descricao.trim() || null }
    if (form.responsavel_id !== tarefa.responsavel_atual_id)
      mudancas.responsavel = { de: tarefa.responsavel_atual_id, para: form.responsavel_id }
    if (form.data_vencimento !== tarefa.data_vencimento)
      mudancas.data_vencimento = { de: tarefa.data_vencimento, para: form.data_vencimento }
    if (horaFinal !== (tarefa.hora_limite ? tarefa.hora_limite.substring(0, 5) : null))
      mudancas.hora_limite = { de: tarefa.hora_limite || null, para: horaFinal }
    if (form.foto_obrigatoria !== tarefa.foto_obrigatoria)
      mudancas.foto_obrigatoria = { de: tarefa.foto_obrigatoria, para: form.foto_obrigatoria }

    const envolvidosFinal = envolvidoIds.filter((id) => id !== form.responsavel_id).sort()
    const envolvidosMudou = JSON.stringify(envolvidosFinal) !== JSON.stringify(envolvidoIdsOriginais)
    if (envolvidosMudou) mudancas.envolvidos = { de: envolvidoIdsOriginais, para: envolvidosFinal }

    if (Object.keys(mudancas).length === 0) {
      onClose()
      return
    }

    setSalvando(true)
    setErro('')
    try {
      const { data: updated, error } = await supabase
        .from('tarefas')
        .update({
          titulo: tituloFinal,
          descricao: form.descricao.trim() || null,
          responsavel_atual_id: form.responsavel_id,
          data_vencimento: form.data_vencimento,
          hora_limite: horaFinal,
          foto_obrigatoria: form.foto_obrigatoria,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tarefa.id)
        .select('id')

      if (error) {
        logErro('Erro ao editar (update tarefas):', error)
        setErro('Erro ao salvar: ' + (error.message || 'sem mensagem'))
        setSalvando(false)
        return
      }
      if (!updated || updated.length === 0) {
        setErro('Você não tem permissão para editar esta tarefa (RLS).')
        setSalvando(false)
        return
      }

      if (envolvidosMudou) {
        await supabase.from('tarefas_envolvidos').delete().eq('tarefa_id', tarefa.id)
        if (envolvidosFinal.length > 0) {
          const { error: envError } = await supabase
            .from('tarefas_envolvidos')
            .insert(envolvidosFinal.map((usuario_id) => ({ tarefa_id: tarefa.id, usuario_id })))
          if (envError) logErro('Erro ao salvar envolvidos:', envError)
        }
      }

      const { error: histError } = await supabase.from('tarefas_historico').insert({
        tarefa_id: tarefa.id,
        alteracao_tipo: 'edicao',
        dados_json: mudancas,
        registrado_por: usuarioAtualId,
      })
      if (histError) logErro('Editou, mas falhou ao gravar histórico:', histError)

      onSaved()
      onClose()
    } catch (err: any) {
      logErro('Erro ao editar (exceção):', err)
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Editar Tarefa</h3>
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
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {chips.map((c) => (
                  <button
                    key={c.titulo}
                    type="button"
                    onClick={() => setForm({ ...form, titulo: c.titulo })}
                    className="text-xs bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 hover:bg-pink-100 hover:text-pink-700 transition-colors"
                  >
                    {c.titulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Responsável *</label>
            <SeletorPessoas
              pessoas={usuariosDoSetor}
              selecionados={form.responsavel_id ? [form.responsavel_id] : []}
              placeholder="Selecione o responsável..."
              onChange={(ids) => setForm({ ...form, responsavel_id: ids[0] || '' })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Envolvidos (opcional)</label>
            <p className="text-xs text-gray-400 mb-2">
              Além do responsável, quem mais pode concluir esta tarefa.
            </p>
            <SeletorPessoas
              pessoas={usuariosDoSetor.filter((u) => u.id !== form.responsavel_id)}
              selecionados={envolvidoIds}
              multi
              placeholder="Selecione os envolvidos..."
              onChange={setEnvolvidoIds}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
              <input
                type="date"
                value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora limite</label>
              <input
                type="time"
                value={form.hora_limite}
                onChange={(e) => setForm({ ...form, hora_limite: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="edit_foto_obrigatoria"
              checked={form.foto_obrigatoria}
              onChange={(e) => setForm({ ...form, foto_obrigatoria: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="edit_foto_obrigatoria" className="text-sm font-medium text-gray-700">
              Exigir foto para concluir
            </label>
          </div>

          <div className="flex gap-3">
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
            >
              <Save size={16} /> Salvar
            </button>
            <button
              onClick={onClose}
              disabled={salvando}
              className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
