import { supabase } from '@/lib/supabase'

/**
 * Comprime imagem no client antes de upload
 * Máximo 1600px no lado maior, quality 0.8
 *
 * Evita FileReader.readAsDataURL: fotos de câmera Android costumam vir em
 * 15-40MB, e converter isso para base64 (que infla ~33% e fica todo em
 * memória como string) trava/recarrega o Chrome em aparelhos intermediários
 * no meio do processo, sem erro algum — a tarefa fica pendente do nada.
 * createImageBitmap/ObjectURL decodificam o arquivo direto, sem esse passo.
 */
export async function compressImage(file: File): Promise<Blob> {
  const maxSize = 1600

  function toBlob(
    sourceWidth: number,
    sourceHeight: number,
    draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void
  ): Promise<Blob> {
    let width = sourceWidth
    let height = sourceHeight

    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width)
        width = maxSize
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height)
        height = maxSize
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return Promise.reject(new Error('Falha ao obter contexto do canvas'))
    }

    draw(ctx, canvas)

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir imagem'))),
        'image/jpeg',
        0.8
      )
    })
  }

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try {
      return await toBlob(bitmap.width, bitmap.height, (ctx, canvas) =>
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      )
    } finally {
      bitmap.close()
    }
  }

  // Fallback para navegadores sem createImageBitmap: ObjectURL ainda evita base64
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Falha ao carregar imagem'))
      el.src = objectUrl
    })
    return await toBlob(img.naturalWidth, img.naturalHeight, (ctx, canvas) =>
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    )
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Calcula se tarefa está atrasada (timezone America/Sao_Paulo)
 * Com hora_limite: data_vencimento + hora_limite < agora
 * Sem hora_limite: data_vencimento < hoje (23:59:59 SP)
 */
export function isAtrasada(
  data_vencimento: string, // formato YYYY-MM-DD
  hora_limite: string | null, // formato HH:MM
  status: string
): boolean {
  if (status === 'concluida' || status === 'cancelada') {
    return false
  }

  // Calcula "hoje" em São Paulo usando formato ISO YYYY-MM-DD
  const hoje = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  })

  // Calcula "agora" em São Paulo (HH:MM)
  const agora = new Date()
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const timePart = formatter.format(agora)
  const [h, min, s] = timePart.split(':')
  const horaAgora = `${h}:${min}`

  if (hora_limite) {
    // Com hora: compara data_vencimento + hora_limite com agora em SP
    if (data_vencimento < hoje) return true
    if (data_vencimento > hoje) return false
    // Mesma data: compara hora (normaliza para HH:MM, removendo :SS se existir)
    const horaLimiteNorm = hora_limite.substring(0, 5) // pega apenas HH:MM
    return horaLimiteNorm <= horaAgora
  } else {
    // Sem hora: compara apenas data (tarefa atrasada se vencimento < hoje)
    return data_vencimento < hoje
  }
}

/**
 * Upload de foto para Storage
 * Path: {setor_id}/{tarefa_id}/{tentativa_num}/{timestamp}.jpg
 */
export async function uploadFoto(
  setorId: string,
  tarefaId: string,
  tentativaNum: number,
  file: Blob
): Promise<string> {
  const timestamp = Date.now()
  const path = `${setorId}/${tarefaId}/${tentativaNum}/${timestamp}.jpg`

  const { data, error } = await supabase.storage
    .from('tarefas-provas')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) {
    throw new Error(`Falha ao fazer upload: ${error.message}`)
  }

  // Gerar URL assinada válida por 1 ano
  const { data: signedData, error: signedError } = await supabase.storage
    .from('tarefas-provas')
    .createSignedUrl(path, 60 * 60 * 24 * 365)

  if (signedError) {
    throw new Error(`Falha ao gerar URL: ${signedError.message}`)
  }

  return signedData.signedUrl
}

/**
 * Formata data para exibição (pt-BR)
 */
export function formatData(data: string): string {
  return new Date(`${data}T00:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

/**
 * Formata hora (HH:MM)
 */
export function formatHora(hora: string): string {
  if (!hora) return ''
  return hora.substring(0, 5)
}

/**
 * Obtém dia da semana em pt-BR
 */
export function getDiaSemana(data: string): string {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
  const date = new Date(`${data}T00:00:00`)
  return dias[date.getDay()]
}

/**
 * Obtém número do dia do mês
 */
export function getDiaMes(data: string): number {
  return new Date(`${data}T00:00:00`).getDate()
}

/**
 * Detecta padrão de recorrência a partir das datas (YYYY-MM-DD) de ocorrências
 * passadas de um mesmo título. Retorna null se não houver padrão claro.
 * dias_semana: 0=Segunda .. 6=Domingo.
 */
export function detectarPadraoRecorrencia(
  datas: string[]
): { frequencia: 'diaria' | 'semanal' | 'mensal'; diasSemana: number[] } | null {
  const uniq = Array.from(new Set(datas)).sort()
  if (uniq.length < 3) return null

  const gaps: number[] = []
  for (let i = 1; i < uniq.length; i++) {
    const d1 = new Date(uniq[i - 1] + 'T12:00:00').getTime()
    const d2 = new Date(uniq[i] + 'T12:00:00').getTime()
    gaps.push(Math.round((d2 - d1) / 86400000))
  }
  const ordenados = [...gaps].sort((a, b) => a - b)
  const mediana = ordenados[Math.floor(ordenados.length / 2)]

  const appDow = (ds: string) => (new Date(ds + 'T12:00:00').getDay() + 6) % 7

  // Diária: intervalos ~1 dia
  if (mediana <= 1) return { frequencia: 'diaria', diasSemana: [] }

  // Mensal: intervalos ~1 mês
  if (mediana >= 27 && mediana <= 31) return { frequencia: 'mensal', diasSemana: [] }

  // Semanal (inclui múltiplos dias fixos, ex.: Ter/Qui):
  // poucos dias da semana distintos, cada um repetindo ao menos 2x
  const contDow: Record<number, number> = {}
  uniq.forEach((d) => {
    const dow = appDow(d)
    contDow[dow] = (contDow[dow] || 0) + 1
  })
  const diasFixos = Object.entries(contDow)
    .filter(([, c]) => c >= 2)
    .map(([dow]) => Number(dow))
    .sort((a, b) => a - b)
  if (diasFixos.length >= 1 && diasFixos.length <= 3) {
    return { frequencia: 'semanal', diasSemana: diasFixos }
  }

  return null
}

const DIAS_SEMANA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
export function labelDiasSemana(dias: number[]): string {
  return dias.map((d) => DIAS_SEMANA_LABEL[d] ?? '?').join(', ')
}

export function labelFrequencia(f: 'diaria' | 'semanal' | 'mensal'): string {
  return { diaria: 'diária', semanal: 'semanal', mensal: 'mensal' }[f]
}

/**
 * Prazo pré-preenchido do "Refazer" (editável no form).
 * Operacional: hoje 18:30 se faltarem 2h+; senão dia seguinte 18:30.
 * Administrativo: dia seguinte, sem hora.
 * Timezone America/Sao_Paulo.
 */
export function calcularPrazoRefazer(
  setorTipo: 'operacional' | 'administrativo'
): { data: string; hora: string } {
  const hoje = getHoje()
  const amanha = (() => {
    const d = new Date(hoje + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dia = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dia}`
  })()

  if (setorTipo === 'administrativo') {
    return { data: amanha, hora: '' }
  }

  // Operacional: comparar com 18:30 no fuso de São Paulo
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const [h, m] = fmt.format(new Date()).split(':').map(Number)
  const minutosAgora = h * 60 + m
  const limite = 18 * 60 + 30
  const faltam = limite - minutosAgora

  return faltam >= 120
    ? { data: hoje, hora: '18:30' }
    : { data: amanha, hora: '18:30' }
}

/**
 * Retorna hoje em formato YYYY-MM-DD no fuso America/Sao_Paulo
 * (en-CA produz formato ISO YYYY-MM-DD)
 */
export function getHoje(): string {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * Normaliza título para COMPARAÇÃO: minúsculas, sem acentos, espaços colapsados.
 */
export function normalizarTitulo(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Normaliza título para GRAVAÇÃO: só trim + colapsa espaços (mantém caixa/acentos).
 */
export function colapsarEspacos(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

/**
 * Tema de cores por setor.
 * Classes literais completas para o Tailwind detectar no build.
 */
export interface SetorTheme {
  headerGrad: string // gradiente do header e do dia selecionado
  subtext: string // subtítulo do header
  selectText: string // texto do seletor/botão sobre fundo branco
  badge: string // badge de contagem (dia não selecionado)
  daySelText: string // texto do badge no dia selecionado
  dayBorderTasks: string // borda dos dias com tarefas (não selecionado)
}

const SETOR_THEMES: Record<string, SetorTheme> = {
  paraisopolis: {
    headerGrad: 'from-pink-600 to-rose-500',
    subtext: 'text-pink-100',
    selectText: 'text-pink-700',
    badge: 'bg-pink-600',
    daySelText: 'text-pink-700',
    dayBorderTasks: 'border-pink-200 hover:border-pink-400',
  },
  itajuba: {
    headerGrad: 'from-amber-500 to-yellow-400',
    subtext: 'text-amber-50',
    selectText: 'text-amber-700',
    badge: 'bg-amber-500',
    daySelText: 'text-amber-700',
    dayBorderTasks: 'border-amber-200 hover:border-amber-400',
  },
  cozinha: {
    headerGrad: 'from-green-600 to-emerald-500',
    subtext: 'text-green-50',
    selectText: 'text-green-700',
    badge: 'bg-green-600',
    daySelText: 'text-green-700',
    dayBorderTasks: 'border-green-200 hover:border-green-400',
  },
  administrativo: {
    headerGrad: 'from-blue-600 to-sky-500',
    subtext: 'text-blue-100',
    selectText: 'text-blue-700',
    badge: 'bg-blue-600',
    daySelText: 'text-blue-700',
    dayBorderTasks: 'border-blue-200 hover:border-blue-400',
  },
}

/**
 * Retorna o tema do setor pelo nome (ignora acentos/maiúsculas).
 * Fallback: rosa (Paraisópolis).
 */
export function getSetorTheme(nome?: string): SetorTheme {
  if (!nome) return SETOR_THEMES.paraisopolis
  const key = nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return SETOR_THEMES[key] || SETOR_THEMES.paraisopolis
}

/**
 * Retorna status com label e cor
 */
export const STATUS_INFO = {
  pendente: {
    label: 'Pendente',
    color: 'bg-amber-100 text-amber-700 border-amber-300',
    bgContent: 'bg-amber-50',
  },
  pronta_revisao: {
    label: 'Pronta para Revisão',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    bgContent: 'bg-blue-50',
  },
  concluida: {
    label: 'Concluída',
    color: 'bg-green-100 text-green-700 border-green-300',
    bgContent: 'bg-green-50',
  },
  refazer_pendente: {
    label: 'Refazer Pendente',
    color: 'bg-red-100 text-red-700 border-red-300',
    bgContent: 'bg-red-50',
  },
  cancelada: {
    label: 'Cancelada',
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    bgContent: 'bg-gray-50',
  },
}
