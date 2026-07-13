'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Setor } from '@/lib/types'
import { normalizarTitulo, colapsarEspacos, detectarPadraoRecorrencia, labelDiasSemana, labelFrequencia } from '@/lib/tarefas-utils'
import { X, Save, Sparkles } from 'lucide-react'
import SeletorPessoas from './SeletorPessoas'

interface NovaTarefaModalProps {
  setor: Setor
  usuariosDoSetor: { id: string; nome: string }[]
  gestores?: { id: string; nome: string }[]
  criadoPor: string
  permitirRecorrencia?: boolean
  onClose: () => void
  onCreated: () => void
}

const HOJE = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function NovaTarefaModal({
  setor,
  usuariosDoSetor,
  gestores = [],
  criadoPor,
  permitirRecorrencia = false,
  onClose,
  onCreated,
}: NovaTarefaModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    responsavel_id: '',
    data_vencimento: HOJE(),
    hora_limite: '',
    foto_obrigatoria: setor.tipo === 'operacional',
  })

  // Envolvidos além do responsável — só p/ tarefa avulsa (não recorrente)
  const [envolvidoIds, setEnvolvidoIds] = useState<string[]>([])
  const [mostrarEnvolvidos, setMostrarEnvolvidos] = useState(false)

  // Recorrência
  const [recorrente, setRecorrente] = useState(false)
  const [frequencia, setFrequencia] = useState<'diaria' | 'semanal' | 'mensal'>('diaria')
  const [diasSemana, setDiasSemana] = useState<number[]>([]) // 0=Seg..6=Dom
  const [dataInicio, setDataInicio] = useState(HOJE())
  const [dataFim, setDataFim] = useState('')

  // Sugestões de título (por setor)
  const [titulosSetor, setTitulosSetor] = useState<{ titulo: string; count: number }[]>([])
  // Ocorrências dos últimos 90 dias (para detectar padrão de recorrência)
  const [ocorrencias, setOcorrencias] = useState<{ titulo: string; data_vencimento: string }[]>([])
  const [sugestaoDispensada, setSugestaoDispensada] = useState(false)

  // Aviso de duplicidade (não bloqueante)
  const [avisoDup, setAvisoDup] = useState<string | null>(null)

  // Não pré-seleciona responsável — obriga o usuário a escolher alguém
  // (deixar um padrão pré-marcado fazia as pessoas simplesmente não trocarem).
  useEffect(() => {
    setForm((f) => ({ ...f, foto_obrigatoria: setor.tipo === 'operacional' }))
  }, [setor.id])

  // Carrega títulos existentes do setor (tarefas + recorrências ativas), por frequência de uso
  useEffect(() => {
    async function carregarTitulos() {
      const [{ data: tData }, { data: rData }] = await Promise.all([
        supabase.from('tarefas').select('titulo').eq('setor_id', setor.id),
        supabase
          .from('tarefas_recorrencias')
          .select('titulo')
          .eq('setor_id', setor.id)
          .eq('ativa', true),
      ])

      // Agrupa por título NORMALIZADO (sem acento/caixa/espaço) — senão
      // "Abertura de caixa" e "abertura de caixa" contam como títulos
      // diferentes, cada um com contagem baixa, e um título que na prática
      // se repete bastante acaba não entrando no top 10 por causa dessa
      // fragmentação (era a causa dos chips de sugestão não aparecerem).
      const contagem: Record<string, { titulo: string; count: number }> = {}
      ;[...(tData || []), ...(rData || [])].forEach((row: any) => {
        const raw = (row.titulo || '').trim()
        if (!raw) return
        const chave = normalizarTitulo(raw)
        if (!contagem[chave]) contagem[chave] = { titulo: raw, count: 0 }
        contagem[chave].count++
      })

      const lista = Object.values(contagem)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
      setTitulosSetor(lista)
    }
    carregarTitulos()

    // Ocorrências dos últimos 90 dias, por data de vencimento (até hoje)
    async function carregarOcorrencias() {
      const noventa = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0]
      const ateHoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      const { data } = await supabase
        .from('tarefas')
        .select('titulo, data_vencimento')
        .eq('setor_id', setor.id)
        .gte('data_vencimento', noventa)
        .lte('data_vencimento', ateHoje)
      setOcorrencias(data || [])
    }
    carregarOcorrencias()
  }, [setor.id])

  function toggleDia(d: number) {
    setDiasSemana((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    )
  }

  // Chips filtrados pelo que o usuário digita (ignora acento/caixa).
  // Só aparecem após 3+ caracteres, para não listar o setor inteiro.
  const tituloNorm = normalizarTitulo(form.titulo)
  const chips =
    tituloNorm.length >= 3
      ? titulosSetor.filter((t) => normalizarTitulo(t.titulo).includes(tituloNorm))
      : []

  // Sugestão de adotar título existente (mesmo normalizado, grafia diferente)
  const sugestaoAdotar =
    form.titulo.trim() !== ''
      ? titulosSetor.find(
          (t) =>
            normalizarTitulo(t.titulo) === tituloNorm &&
            t.titulo !== colapsarEspacos(form.titulo)
        )?.titulo
      : undefined

  // Sugestão inteligente de recorrência: título com 3+ ocorrências em padrão regular
  const ocorrenciasDoTitulo =
    tituloNorm !== ''
      ? ocorrencias.filter((o) => normalizarTitulo(o.titulo) === tituloNorm)
      : []
  const padraoDetectado =
    permitirRecorrencia && !recorrente && ocorrenciasDoTitulo.length >= 3
      ? detectarPadraoRecorrencia(ocorrenciasDoTitulo.map((o) => o.data_vencimento))
      : null

  function aplicarPadrao() {
    if (!padraoDetectado) return
    setFrequencia(padraoDetectado.frequencia)
    setDiasSemana(padraoDetectado.diasSemana)
    setRecorrente(true)
  }

  async function criar(forcar = false) {
    if (!form.titulo.trim()) {
      setErro('Título é obrigatório')
      return
    }
    if (!form.responsavel_id) {
      setErro('Selecione um responsável')
      return
    }
    if (recorrente && frequencia === 'semanal' && diasSemana.length === 0) {
      setErro('Selecione ao menos um dia da semana para a recorrência')
      return
    }

    const tituloFinal = colapsarEspacos(form.titulo)

    // Aviso de duplicidade (apenas tarefa única, não recorrente)
    if (!recorrente && !forcar) {
      const { data: existentes } = await supabase
        .from('tarefas')
        .select('titulo, responsavel_atual_id')
        .eq('setor_id', setor.id)
        .eq('data_vencimento', form.data_vencimento)
        .in('status', ['pendente', 'pronta_revisao'])

      const dup = (existentes || []).find(
        (e: any) => normalizarTitulo(e.titulo) === normalizarTitulo(tituloFinal)
      )
      if (dup) {
        const respNome =
          usuariosDoSetor.find((u) => u.id === dup.responsavel_atual_id)?.nome ||
          'outro colaborador'
        setAvisoDup(
          `Já existe uma tarefa "${dup.titulo}" pendente para este dia, atribuída a ${respNome}. Criar mesmo assim?`
        )
        return
      }
    }

    setSalvando(true)
    setErro('')
    setAvisoDup(null)

    try {
      if (recorrente) {
        // Cria o molde; a função gera as instâncias da janela
        const diaMes = new Date(dataInicio + 'T12:00:00').getDate()
        const { error: recError } = await supabase
          .from('tarefas_recorrencias')
          .insert({
            titulo: tituloFinal,
            descricao: form.descricao.trim() || null,
            setor_id: setor.id,
            responsavel_id: form.responsavel_id,
            foto_obrigatoria: form.foto_obrigatoria,
            hora_limite: form.hora_limite || null,
            frequencia,
            dias_semana: frequencia === 'semanal' ? diasSemana : null,
            dia_mes: frequencia === 'mensal' ? diaMes : null,
            proxima_data: dataInicio,
            data_inicio: dataInicio,
            data_fim: dataFim || null,
            ativa: true,
            criado_por: criadoPor,
          })

        if (recError) {
          setErro('Falha ao salvar recorrência: ' + recError.message)
          setSalvando(false)
          return
        }

        // Geração imediata das instâncias (janela de 30 dias)
        const { data: qtd, error: rpcError } = await supabase.rpc(
          'gerar_tarefas_recorrentes'
        )
        if (rpcError) {
          setErro('Recorrência criada, mas falhou ao gerar instâncias: ' + rpcError.message)
          setSalvando(false)
          return
        }
        alert(`Recorrência criada — ${qtd ?? 0} instâncias geradas nos próximos 30 dias.`)
      } else {
        const { data: novaTarefa, error } = await supabase
          .from('tarefas')
          .insert({
            titulo: tituloFinal,
            descricao: form.descricao.trim() || null,
            setor_id: setor.id,
            status: 'pendente',
            data_vencimento: form.data_vencimento,
            hora_limite: form.hora_limite || null,
            criado_por: criadoPor,
            responsavel_original_id: form.responsavel_id,
            responsavel_atual_id: form.responsavel_id,
            foto_obrigatoria: form.foto_obrigatoria,
            tentativa_num: 1,
          })
          .select('id')
          .single()
        if (error) {
          setErro(error.message)
          setSalvando(false)
          return
        }

        const envolvidosFinal = envolvidoIds.filter((id) => id !== form.responsavel_id)
        if (envolvidosFinal.length > 0 && novaTarefa) {
          const { error: envError } = await supabase
            .from('tarefas_envolvidos')
            .insert(envolvidosFinal.map((usuario_id) => ({ tarefa_id: novaTarefa.id, usuario_id })))
          if (envError) console.error('Erro ao salvar envolvidos da tarefa:', envError)
        }
      }

      onCreated()
      onClose()
    } catch (err) {
      console.error(err)
      setErro('Erro ao criar tarefa')
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">
            Nova Tarefa · {setor.nome}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {erro}
          </div>
        )}

        {usuariosDoSetor.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            ⚠️ Nenhum usuário neste setor. Atribua usuários antes de criar tarefas.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Título */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título *
              </label>
              <input
                type="text"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                placeholder="Ex: Abertura de caixa"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />

              {/* Chips de sugestão */}
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

              {/* Sugestão de adotar grafia existente */}
              {sugestaoAdotar && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, titulo: sugestaoAdotar })}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  Usar título existente: "{sugestaoAdotar}"
                </button>
              )}
            </div>

            {/* Sugestão inteligente de recorrência */}
            {padraoDetectado && !sugestaoDispensada && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-800 flex items-start gap-2">
                  <Sparkles size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Essa tarefa apareceu <strong>{ocorrenciasDoTitulo.length}x</strong> nos últimos 90 dias e
                    parece <strong>{labelFrequencia(padraoDetectado.frequencia)}</strong>
                    {padraoDetectado.frequencia === 'semanal' &&
                      padraoDetectado.diasSemana.length > 0 &&
                      ` (${labelDiasSemana(padraoDetectado.diasSemana)})`}
                    . Criar como recorrente?
                  </span>
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={aplicarPadrao}
                    className="flex-1 bg-purple-600 text-white rounded-lg py-1.5 text-sm font-semibold hover:bg-purple-700"
                  >
                    Sim, tornar recorrente
                  </button>
                  <button
                    type="button"
                    onClick={() => setSugestaoDispensada(true)}
                    className="flex-1 bg-white text-gray-600 border border-gray-300 rounded-lg py-1.5 text-sm font-medium hover:bg-gray-50"
                  >
                    Agora não
                  </button>
                </div>
              </div>
            )}

            {/* Descrição */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descrição
              </label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="Detalhes da tarefa..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
              />
            </div>

            {/* Responsável */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável *
              </label>
              <SeletorPessoas
                grupos={[
                  { label: setor.nome, pessoas: usuariosDoSetor },
                  {
                    label: 'Gestores',
                    pessoas: gestores.filter((g) => !usuariosDoSetor.some((u) => u.id === g.id)),
                  },
                ]}
                selecionados={form.responsavel_id ? [form.responsavel_id] : []}
                onChange={(ids) => setForm({ ...form, responsavel_id: ids[0] || '' })}
              />
              {!recorrente && !mostrarEnvolvidos && (
                <button
                  type="button"
                  onClick={() => setMostrarEnvolvidos(true)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  + Envolver mais pessoas
                </button>
              )}
            </div>

            {/* Envolvidos: além do responsável, quem mais pode concluir a tarefa */}
            {!recorrente && mostrarEnvolvidos && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Envolvidos (opcional)
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Além do responsável, quem mais pode concluir esta tarefa.
                </p>
                <SeletorPessoas
                  grupos={[
                    {
                      label: setor.nome,
                      pessoas: usuariosDoSetor.filter((u) => u.id !== form.responsavel_id),
                    },
                    {
                      label: 'Gestores',
                      pessoas: gestores.filter(
                        (g) => g.id !== form.responsavel_id && !usuariosDoSetor.some((u) => u.id === g.id)
                      ),
                    },
                  ]}
                  selecionados={envolvidoIds}
                  multi
                  onChange={setEnvolvidoIds}
                />
              </div>
            )}

            {/* Datas: única (tarefa avulsa) OU início/fim (recorrente) */}
            {!recorrente ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vencimento *
                  </label>
                  <input
                    type="date"
                    value={form.data_vencimento}
                    onChange={(e) =>
                      setForm({ ...form, data_vencimento: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora limite
                  </label>
                  <input
                    type="time"
                    value={form.hora_limite}
                    onChange={(e) =>
                      setForm({ ...form, hora_limite: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Início *
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fim (opcional)
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Hora limite (cada instância)
                  </label>
                  <input
                    type="time"
                    value={form.hora_limite}
                    onChange={(e) =>
                      setForm({ ...form, hora_limite: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Foto obrigatória */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="foto_obrigatoria"
                checked={form.foto_obrigatoria}
                onChange={(e) =>
                  setForm({ ...form, foto_obrigatoria: e.target.checked })
                }
                className="w-4 h-4 rounded"
              />
              <label
                htmlFor="foto_obrigatoria"
                className="text-sm font-medium text-gray-700"
              >
                Exigir foto para concluir
              </label>
            </div>

            {/* Recorrência (apenas admin) */}
            {permitirRecorrencia && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="recorrente"
                  checked={recorrente}
                  onChange={(e) => setRecorrente(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label
                  htmlFor="recorrente"
                  className="text-sm font-medium text-gray-700"
                >
                  🔁 Tarefa recorrente
                </label>
              </div>

              {recorrente && (
                <div className="space-y-3 pl-1">
                  <div className="flex gap-2">
                    {(['diaria', 'semanal', 'mensal'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFrequencia(f)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                          frequencia === f
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {frequencia === 'semanal' && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Dias da semana</p>
                      <div className="flex gap-1 flex-wrap">
                        {DIAS.map((d, idx) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDia(idx)}
                            className={`w-10 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              diasSemana.includes(idx)
                                ? 'bg-pink-600 text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {frequencia === 'mensal' && (
                    <p className="text-xs text-gray-500">
                      Repetirá todo dia{' '}
                      {new Date(dataInicio + 'T12:00:00').getDate()} do mês.
                    </p>
                  )}

                  <p className="text-xs text-gray-400">
                    Instâncias são geradas para os próximos 30 dias e estendidas
                    automaticamente.
                  </p>
                </div>
              )}
            </div>
            )}

            {/* Aviso de duplicidade (não bloqueante) */}
            {avisoDup && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm text-amber-800 mb-3">⚠️ {avisoDup}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => criar(true)}
                    disabled={salvando}
                    className="flex-1 bg-amber-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
                  >
                    Criar mesmo assim
                  </button>
                  <button
                    onClick={() => setAvisoDup(null)}
                    disabled={salvando}
                    className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {!avisoDup && (
              <div className="flex gap-3">
                <button
                  onClick={() => criar(false)}
                  disabled={salvando}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 font-semibold flex items-center justify-center gap-2 hover:bg-green-700 disabled:opacity-50"
                >
                  <Save size={16} /> Criar
                </button>
                <button
                  onClick={onClose}
                  disabled={salvando}
                  className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
