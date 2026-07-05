'use client'
import { useState, useRef, useEffect } from 'react'
import { Tarefa, TarefaEvidencia, TarefaComentario } from '@/lib/types'
import { formatData, formatHora, compressImage, uploadFoto, STATUS_INFO, calcularPrazoRefazer } from '@/lib/tarefas-utils'
import { supabase } from '@/lib/supabase'
import { X, Upload, Loader, MessageSquare, Pencil, RotateCw } from 'lucide-react'
import EditarTarefaModal from './EditarTarefaModal'
import EditarRecorrenciaModal from './EditarRecorrenciaModal'

// Loga message/code/details/hint do erro do Supabase (que serializa como {} no console cru)
function logErro(contexto: string, error: any) {
  console.error(contexto, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  })
}

interface TarefaModalProps {
  tarefa: Tarefa
  responsavelNome: string
  evidencias: TarefaEvidencia[]
  comentarios: TarefaComentario[]
  usuariosMap: Record<string, { nome: string; role?: string }>
  usuariosDoSetor: { id: string; nome: string }[]
  setorTipo: 'operacional' | 'administrativo'
  usuarioAtualId: string
  usuarioAtualRole: string
  aberta: boolean
  onClose: () => void
  onStatusChange?: () => void
}

export default function TarefaModal({
  tarefa,
  responsavelNome,
  evidencias,
  comentarios,
  usuariosMap,
  usuariosDoSetor,
  setorTipo,
  usuarioAtualId,
  usuarioAtualRole,
  aberta,
  onClose,
  onStatusChange,
}: TarefaModalProps) {
  const [fazendoUpload, setFazendoUpload] = useState(false)
  const [fotoUpload, setFotoUpload] = useState<File | null>(null)
  const [previewFoto, setPreviewFoto] = useState<string | null>(null)
  const [feedbackTexto, setFeedbackTexto] = useState('')
  const [mostrarRefazer, setMostrarRefazer] = useState(false)
  const [prazoData, setPrazoData] = useState('')
  const [prazoHora, setPrazoHora] = useState('')
  const [editando, setEditando] = useState(false)
  const [mostrarEditarRecorrencia, setMostrarEditarRecorrencia] = useState(false)
  const [recorrenciaData, setRecorrenciaData] = useState<any>(null)
  const [carregandoRecorrencia, setCarregandoRecorrencia] = useState(false)
  const inputFileRef = useRef<HTMLInputElement>(null)

  // Carrega dados da recorrência se a tarefa for uma instância
  useEffect(() => {
    async function carregarRecorrencia() {
      if (!tarefa.recorrencia_id) return
      setCarregandoRecorrencia(true)
      const { data, error } = await supabase
        .from('tarefas_recorrencias')
        .select('*')
        .eq('id', tarefa.recorrencia_id)
        .single()
      if (error) {
        logErro('Erro ao carregar recorrência:', error)
        return
      }
      setRecorrenciaData(data)
      setCarregandoRecorrencia(false)
    }
    carregarRecorrencia()
  }, [tarefa.recorrencia_id])

  if (!aberta) return null

  const ehResponsavel = usuarioAtualId === tarefa.responsavel_atual_id
  const ehAdmin = usuarioAtualRole === 'admin'
  const ehCriador = usuarioAtualId === tarefa.criado_por
  const podeConluir =
    ehResponsavel &&
    (tarefa.status === 'pendente' || tarefa.status === 'refazer_pendente')
  // Admin cancela qualquer tarefa aberta; criador (colaborador) só a que criou,
  // ainda pendente e sem evidência enviada.
  const podeCancelar =
    (ehAdmin && tarefa.status !== 'cancelada' && tarefa.status !== 'concluida') ||
    (ehCriador &&
      tarefa.status === 'pendente' &&
      evidencias.length === 0)
  const podeRevisar = ehAdmin && tarefa.status === 'pronta_revisao'
  // Admin edita qualquer tarefa não concluída/cancelada; criador só a própria
  // pendente e sem evidência (espelha a RLS).
  const podeEditar =
    (ehAdmin && tarefa.status !== 'concluida' && tarefa.status !== 'cancelada') ||
    (ehCriador && tarefa.status === 'pendente' && evidencias.length === 0)

  // Exibe o criador quando não for admin (rastreabilidade)
  const criador = usuariosMap[tarefa.criado_por]
  const criadoPorLabel =
    criador && criador.role !== 'admin' ? criador.nome : null

  // Evidências da tentativa atual (para destaque na revisão)
  const evidenciasTentativaAtual = evidencias.filter(
    (e) => e.tentativa_num === tarefa.tentativa_num
  )
  const statusInfo = STATUS_INFO[tarefa.status]

  const handleCancelar = async () => {
    if (!confirm(`Cancelar a tarefa "${tarefa.titulo}"? Ela sai das visões Hoje/Semana, mas o histórico é preservado.`)) return
    try {
      setFazendoUpload(true)

      // 1. Atualiza status. Pede retorno para detectar RLS que filtra a linha (0 linhas).
      const { data: updated, error } = await supabase
        .from('tarefas')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', tarefa.id)
        .select('id')
      if (error) {
        logErro('Erro ao cancelar (update tarefas):', error)
        alert('Erro ao cancelar: ' + (error.message || 'sem mensagem'))
        return
      }
      if (!updated || updated.length === 0) {
        console.error('Cancelamento sem efeito: 0 linhas atualizadas (RLS bloqueou o UPDATE).')
        alert('Não foi possível cancelar: você não tem permissão para esta tarefa (RLS bloqueou o UPDATE).')
        return
      }

      // 2. Registra histórico (agora com verificação de erro).
      const { error: histError } = await supabase.from('tarefas_historico').insert({
        tarefa_id: tarefa.id,
        alteracao_tipo: 'cancelamento',
        dados_json: { from_status: tarefa.status, to_status: 'cancelada' },
        registrado_por: usuarioAtualId,
      })
      if (histError) {
        // Não reverte o cancelamento; apenas informa que o histórico falhou.
        logErro('Cancelou, mas falhou ao gravar histórico:', histError)
      }

      onStatusChange?.()
      onClose()
      return
    } catch (err: any) {
      logErro('Erro ao cancelar tarefa (exceção):', err)
      alert('Erro ao cancelar tarefa: ' + (err?.message || 'desconhecido'))
    } finally {
      setFazendoUpload(false)
    }
  }

  const handleAprovar = async () => {
    try {
      setFazendoUpload(true)
      const { data: updated, error } = await supabase
        .from('tarefas')
        .update({
          status: 'concluida',
          concluido_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', tarefa.id)
        .select('id')
      if (error) {
        logErro('Erro ao aprovar (update tarefas):', error)
        alert('Erro ao aprovar: ' + (error.message || 'sem mensagem'))
        return
      }
      if (!updated || updated.length === 0) {
        alert('Não foi possível aprovar: RLS bloqueou o UPDATE.')
        return
      }

      const { error: histError } = await supabase.from('tarefas_historico').insert({
        tarefa_id: tarefa.id,
        alteracao_tipo: 'status_change',
        dados_json: { from_status: 'pronta_revisao', to_status: 'concluida' },
        registrado_por: usuarioAtualId,
      })
      if (histError) logErro('Aprovou, mas falhou ao gravar histórico:', histError)

      onStatusChange?.()
      onClose()
    } catch (err: any) {
      logErro('Erro ao aprovar tarefa (exceção):', err)
      alert('Erro ao aprovar tarefa: ' + (err?.message || 'desconhecido'))
    } finally {
      setFazendoUpload(false)
    }
  }

  const handleRefazer = async () => {
    if (!feedbackTexto.trim()) {
      alert('Descreva o motivo para refazer')
      return
    }
    try {
      setFazendoUpload(true)
      const novaTentativa = tarefa.tentativa_num + 1

      const { data: updated, error } = await supabase
        .from('tarefas')
        .update({
          status: 'refazer_pendente',
          tentativa_num: novaTentativa,
          data_vencimento: prazoData || tarefa.data_vencimento,
          hora_limite: prazoHora || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tarefa.id)
        .select('id')
      if (error) {
        logErro('Erro ao refazer (update tarefas):', error)
        alert('Erro ao marcar refazer: ' + (error.message || 'sem mensagem'))
        return
      }
      if (!updated || updated.length === 0) {
        alert('Não foi possível marcar refazer: RLS bloqueou o UPDATE.')
        return
      }

      // Feedback preservado no histórico de comentários
      const { error: comError } = await supabase.from('tarefas_comentarios').insert({
        tarefa_id: tarefa.id,
        usuario_id: usuarioAtualId,
        texto: feedbackTexto.trim(),
        tipo: 'feedback_refazer',
        tentativa_num: tarefa.tentativa_num,
      })
      if (comError) logErro('Refez, mas falhou ao gravar comentário:', comError)

      const { error: histError } = await supabase.from('tarefas_historico').insert({
        tarefa_id: tarefa.id,
        alteracao_tipo: 'status_change',
        dados_json: {
          from_status: 'pronta_revisao',
          to_status: 'refazer_pendente',
          tentativa: tarefa.tentativa_num,
          feedback: feedbackTexto.trim(),
        },
        registrado_por: usuarioAtualId,
      })
      if (histError) logErro('Refez, mas falhou ao gravar histórico:', histError)

      onStatusChange?.()
      onClose()
    } catch (err: any) {
      logErro('Erro ao marcar refazer (exceção):', err)
      alert('Erro ao marcar refazer: ' + (err?.message || 'desconhecido'))
    } finally {
      setFazendoUpload(false)
    }
  }

  const handleFotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFotoUpload(file)

    // Preview
    const reader = new FileReader()
    reader.onload = (event) => {
      setPreviewFoto(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleConcluir = async () => {
    if (!podeConluir) return

    // Validar foto obrigatória
    if (tarefa.foto_obrigatoria && !fotoUpload && evidencias.length === 0) {
      alert('Foto é obrigatória para esta tarefa')
      return
    }

    try {
      setFazendoUpload(true)

      let fotoUrl = null

      // Upload da foto se selecionada
      if (fotoUpload) {
        const compressedBlob = await compressImage(fotoUpload)
        fotoUrl = await uploadFoto(
          tarefa.setor_id,
          tarefa.id,
          tarefa.tentativa_num,
          compressedBlob
        )
      }

      // Atualizar status da tarefa
      const { data: updated, error: updateError } = await supabase
        .from('tarefas')
        .update({
          status: 'pronta_revisao',
          updated_at: new Date().toISOString(),
        })
        .eq('id', tarefa.id)
        .select('id')

      if (updateError) {
        logErro('Erro ao concluir (update tarefas):', updateError)
        alert('Erro ao concluir: ' + (updateError.message || 'sem mensagem'))
        return
      }
      if (!updated || updated.length === 0) {
        alert('Não foi possível concluir: RLS bloqueou o UPDATE.')
        return
      }

      // Registrar evidência se tiver foto
      if (fotoUrl) {
        const { error: evidError } = await supabase
          .from('tarefas_evidencias')
          .insert({
            tarefa_id: tarefa.id,
            tentativa_num: tarefa.tentativa_num,
            foto_url: fotoUrl,
            uploaded_by: usuarioAtualId,
          })

        if (evidError) {
          logErro('Concluiu, mas falhou ao gravar evidência:', evidError)
        }
      }

      // Registrar no histórico
      const { error: histError } = await supabase.from('tarefas_historico').insert({
        tarefa_id: tarefa.id,
        alteracao_tipo: 'status_change',
        dados_json: {
          from_status: tarefa.status,
          to_status: 'pronta_revisao',
          com_foto: !!fotoUrl,
        },
        registrado_por: usuarioAtualId,
      })
      if (histError) logErro('Concluiu, mas falhou ao gravar histórico:', histError)

      onStatusChange?.()
      onClose()
    } catch (err: any) {
      logErro('Erro ao concluir tarefa (exceção):', err)
      alert('Erro ao concluir tarefa: ' + (err?.message || 'desconhecido'))
    } finally {
      setFazendoUpload(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{tarefa.titulo}</h2>
            <p className="text-sm text-gray-600 mt-1">{responsavelNome}</p>
            {criadoPorLabel && (
              <p className="text-xs text-gray-400 mt-0.5">
                Criada por {criadoPorLabel}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {podeEditar && (
              <button
                onClick={() => setEditando(true)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                title="Editar tarefa"
              >
                <Pencil size={18} />
              </button>
            )}
            {recorrenciaData && ehAdmin && (
              <button
                onClick={() => setMostrarEditarRecorrencia(true)}
                className="p-2 hover:bg-gray-100 rounded-lg text-blue-600"
                title="Editar recorrência"
              >
                <RotateCw size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {tarefa.hora_limite && (
              <span className="text-sm text-gray-600">
                Até {formatHora(tarefa.hora_limite)}
              </span>
            )}
          </div>

          {/* Info de recorrência */}
          {recorrenciaData && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-800">
                🔄 Instância de recorrência
              </p>
              <p className="text-sm text-purple-700 mt-1">
                {recorrenciaData.frequencia === 'diaria' && 'Diariamente'}
                {recorrenciaData.frequencia === 'semanal' && `Semanal (${recorrenciaData.dias_semana?.map((i: number) => ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][i]).join(', ')})`}
                {recorrenciaData.frequencia === 'mensal' && `Todo dia ${recorrenciaData.dia_mes}`}
                {recorrenciaData.data_fim && ` até ${formatData(recorrenciaData.data_fim)}`}
              </p>
              {ehAdmin && (
                <p className="text-xs text-purple-600 mt-2">
                  Clique no ícone ↻ no header para editar esta recorrência.
                </p>
              )}
            </div>
          )}

          {/* Evidência em destaque para revisão do gestor */}
          {podeRevisar && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-800 mb-2">
                Evidência enviada (tentativa {tarefa.tentativa_num})
              </p>
              {evidenciasTentativaAtual.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {evidenciasTentativaAtual.map((ev) => (
                    <a
                      key={ev.id}
                      href={ev.foto_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden hover:opacity-90"
                    >
                      <img
                        src={ev.foto_url}
                        alt="Evidência"
                        className="w-full h-40 object-cover"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-blue-700">
                  Sem foto (tarefa não exigia evidência).
                </p>
              )}
            </div>
          )}

          {/* Descrição */}
          {tarefa.descricao && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">
                Descrição
              </p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                {tarefa.descricao}
              </p>
            </div>
          )}

          {/* Data de vencimento */}
          <div className="text-sm">
            <p className="text-xs font-semibold text-gray-600">Vencimento</p>
            <p className="text-gray-800">
              {formatData(tarefa.data_vencimento)}
            </p>
          </div>

          {/* Evidências anteriores */}
          {evidencias.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">
                Fotos Anteriores
              </p>
              <div className="grid grid-cols-3 gap-2">
                {evidencias.map((ev) => (
                  <a
                    key={ev.id}
                    href={ev.foto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-100 rounded-lg overflow-hidden hover:opacity-75 transition-opacity"
                  >
                    <img
                      src={ev.foto_url}
                      alt="Evidência"
                      className="w-full h-20 object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Histórico de feedback do gestor */}
          {comentarios.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <MessageSquare size={12} /> Feedback do gestor
              </p>
              <div className="space-y-2">
                {comentarios
                  .filter((c) => c.tipo === 'feedback_refazer')
                  .map((c) => (
                    <div
                      key={c.id}
                      className="bg-red-50 border border-red-200 rounded-lg p-3"
                    >
                      <p className="text-sm text-gray-700">{c.texto}</p>
                      <p className="text-xs text-red-500 mt-1">
                        {usuariosMap[c.usuario_id]?.nome || 'Gestor'} · tentativa{' '}
                        {c.tentativa_num} ·{' '}
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Upload de foto (se responsável e pendente/refazer) */}
          {podeConluir && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">
                {tarefa.foto_obrigatoria ? '📷 Foto Obrigatória' : '📷 Foto (opcional)'}
              </p>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                <input
                  ref={inputFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFotoSelect}
                  className="hidden"
                />

                {previewFoto ? (
                  <div className="space-y-2">
                    <img
                      src={previewFoto}
                      alt="Preview"
                      className="w-full max-h-40 object-cover rounded"
                    />
                    <button
                      onClick={() => {
                        setFotoUpload(null)
                        setPreviewFoto(null)
                        if (inputFileRef.current) inputFileRef.current.value = ''
                      }}
                      className="text-xs text-gray-600 hover:text-red-600"
                    >
                      Remover foto
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => inputFileRef.current?.click()}
                    className="flex flex-col items-center gap-2 w-full text-gray-600 hover:text-blue-600"
                  >
                    <Upload size={20} />
                    <span className="text-sm">
                      Toque para tirar foto (câmera)
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Botão Concluir */}
          {podeConluir && (
            <button
              onClick={handleConcluir}
              disabled={fazendoUpload || (tarefa.foto_obrigatoria && !fotoUpload && evidencias.length === 0)}
              className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                fazendoUpload || (tarefa.foto_obrigatoria && !fotoUpload && evidencias.length === 0)
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {fazendoUpload ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Processando...
                </>
              ) : (
                '✓ Concluir'
              )}
            </button>
          )}

          {/* Revisão do gestor (admin, tarefa pronta_revisao) */}
          {podeRevisar && (
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600">
                Revisão do gestor
              </p>

              {!mostrarRefazer ? (
                <div className="flex gap-3">
                  <button
                    onClick={handleAprovar}
                    disabled={fazendoUpload}
                    className="flex-1 py-3 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {fazendoUpload ? (
                      <Loader size={18} className="animate-spin" />
                    ) : (
                      '✓ Aprovar'
                    )}
                  </button>
                  <button
                    onClick={() => {
                      const prazo = calcularPrazoRefazer(setorTipo)
                      setPrazoData(prazo.data)
                      setPrazoHora(prazo.hora)
                      setMostrarRefazer(true)
                    }}
                    disabled={fazendoUpload}
                    className="flex-1 py-3 rounded-lg font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                  >
                    ✗ Refazer
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={feedbackTexto}
                    onChange={(e) => setFeedbackTexto(e.target.value)}
                    rows={3}
                    placeholder="Descreva o que precisa ser refeito..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Novo prazo
                      </label>
                      <input
                        type="date"
                        value={prazoData}
                        onChange={(e) => setPrazoData(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        Hora limite
                      </label>
                      <input
                        type="time"
                        value={prazoHora}
                        onChange={(e) => setPrazoHora(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleRefazer}
                      disabled={fazendoUpload || !feedbackTexto.trim()}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {fazendoUpload ? (
                        <Loader size={16} className="animate-spin" />
                      ) : (
                        'Enviar e devolver'
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setMostrarRefazer(false)
                        setFeedbackTexto('')
                      }}
                      disabled={fazendoUpload}
                      className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                    >
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ações do admin */}
          {podeCancelar && (
            <button
              onClick={handleCancelar}
              disabled={fazendoUpload}
              className="w-full py-2.5 rounded-lg font-medium text-sm bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-50"
            >
              Cancelar tarefa
            </button>
          )}
        </div>
      </div>

      {editando && (
        <EditarTarefaModal
          tarefa={tarefa}
          usuariosDoSetor={usuariosDoSetor}
          usuarioAtualId={usuarioAtualId}
          onClose={() => setEditando(false)}
          onSaved={() => {
            setEditando(false)
            onStatusChange?.()
            onClose()
          }}
        />
      )}

      {mostrarEditarRecorrencia && recorrenciaData && (
        <EditarRecorrenciaModal
          tarefa={tarefa}
          recorrencia={recorrenciaData}
          onClose={() => setMostrarEditarRecorrencia(false)}
          onSaved={() => {
            setMostrarEditarRecorrencia(false)
            onStatusChange?.()
          }}
        />
      )}
    </div>
  )
}
