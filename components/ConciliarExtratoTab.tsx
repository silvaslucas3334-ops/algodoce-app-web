'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import EmptyState from '@/components/EmptyState'
import ExtratoConciliacaoModal from '@/components/ExtratoConciliacaoModal'
import CategorizarReceitaModal from '@/components/CategorizarReceitaModal'
import CategorizarReceitasLoteModal from '@/components/CategorizarReceitasLoteModal'
import ConciliarGrupoModal from '@/components/ConciliarGrupoModal'
import CriarDespesasLoteModal from '@/components/CriarDespesasLoteModal'
import ReverterImportacaoModal from '@/components/ReverterImportacaoModal'
import { importarTransacoesOFX, buscarContaAprendida, aprenderContaOFX, reverterIgnorarTransacao } from '@/lib/financeiro-reconciliacao'
import {
  buscarContagensStatus,
  buscarPaginaExtrato,
  buscarResumoPendencias,
  buscarUltimasImportacoes,
  buscarVinculosDasTransacoes,
  ContagemStatus,
  FiltroLoja,
  FiltroTipo,
  FiltrosExtrato,
  ResumoPendencias,
  TAMANHO_PAGINA,
  UltimaImportacao,
  VinculoExtrato,
} from '@/lib/financeiro-extrato-lista'
import { formatBRL, parseOFXConta, fingerprintOFX, OFXConta } from '@/lib/ofx'
import { Upload, Loader, Link2, Tag, Layers, Receipt, History, AlertTriangle, RotateCcw, Search, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { FinanceiroExtratoTransacao, StatusConciliacao } from '@/lib/types'
import { UNIDADE_LABEL, STATUS_CONCILIACAO_LABEL as STATUS_LABEL, STATUS_CONCILIACAO_COLOR as STATUS_COLOR } from '@/lib/constants'

// Cada loja tem sua própria conta bancária — conta_bancaria vira literalmente
// 'loja1'/'loja2' na importação, sem precisar classificar transação por
// transação (a unidade já vem definida pelo arquivo inteiro).
const CONTAS = [
  { id: 'loja1' as const, label: UNIDADE_LABEL.loja1 },
  { id: 'loja2' as const, label: UNIDADE_LABEL.loja2 },
]

const STATUS_ORDEM: StatusConciliacao[] = ['pendente', 'conciliado', 'ignorado']
const TIPOS: { id: FiltroTipo; label: string }[] = [
  { id: 'todos', label: 'Entradas e saídas' },
  { id: 'entradas', label: 'Só entradas' },
  { id: 'saidas', label: 'Só saídas' },
]

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtNum = (n: number) => n.toLocaleString('pt-BR')
const hojeISO = () => new Date().toISOString().slice(0, 10)
const diasAte = (iso: string) => Math.round((new Date(hojeISO() + 'T00:00:00').getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000)

interface Props {
  // Repassado pro ExtratoConciliacaoModal — ver comentário lá.
  voltarPara: string
}

// Antiga /financeiro/extrato — fundida pra dentro do Fluxo de Caixa como aba. Filtros, aba de status e busca
// vivem na URL (?loja=&st=&tipo=&q=), como nas demais listas do módulo: F5, voltar e link compartilhado
// mantêm o que o usuário estava vendo.
export default function ConciliarExtratoTab({ voltarPara }: Props) {
  const { usuario } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const filtros: FiltrosExtrato = {
    status: (STATUS_ORDEM.includes(searchParams.get('st') as StatusConciliacao) ? searchParams.get('st') : 'pendente') as StatusConciliacao,
    loja: (['loja1', 'loja2'].includes(searchParams.get('loja') || '') ? searchParams.get('loja') : 'todas') as FiltroLoja,
    tipo: (['entradas', 'saidas'].includes(searchParams.get('tipo') || '') ? searchParams.get('tipo') : 'todos') as FiltroTipo,
    q: searchParams.get('q') || '',
  }
  const chaveFiltros = `${filtros.status}|${filtros.loja}|${filtros.tipo}|${filtros.q}`
  const semFiltros = filtros.loja === 'todas' && filtros.tipo === 'todos' && !filtros.q

  const atualizar = useCallback(
    (parcial: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString())
      p.set('tab', 'extrato')
      Object.entries(parcial).forEach(([k, v]) => {
        const padrao = (k === 'loja' && v === 'todas') || (k === 'tipo' && v === 'todos') || (k === 'st' && v === 'pendente')
        if (v === null || v === '' || padrao) p.delete(k)
        else p.set(k, v)
      })
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [searchParams, pathname, router]
  )

  // busca digitada: só mexe na URL (e na consulta) depois de uma pausa
  const [buscaDigitada, setBuscaDigitada] = useState(filtros.q)
  useEffect(() => { setBuscaDigitada(filtros.q) }, [filtros.q])
  useEffect(() => {
    if (buscaDigitada === filtros.q) return
    const t = setTimeout(() => atualizar({ q: buscaDigitada.trim() }), 350)
    return () => clearTimeout(t)
  }, [buscaDigitada, filtros.q, atualizar])

  // Para onde "Nova Despesa"/"Nota de Insumos" volta: a mesma tela, com os mesmos filtros.
  const voltarParaAtual = (() => {
    const base = new URLSearchParams(voltarPara.split('?')[1] || '')
    base.set('tab', 'extrato')
    ;(['loja', 'st', 'tipo', 'q'] as const).forEach((k) => {
      const v = searchParams.get(k)
      if (v) base.set(k, v)
      else base.delete(k)
    })
    return `${pathname}?${base.toString()}`
  })()

  // --- dados da lista ---
  const [linhas, setLinhas] = useState<FinanceiroExtratoTransacao[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erroLista, setErroLista] = useState('')
  const [resumo, setResumo] = useState<ResumoPendencias | null>(null)
  const [contagens, setContagens] = useState<ContagemStatus | null>(null)
  const [ultimas, setUltimas] = useState<Record<'loja1' | 'loja2', UltimaImportacao | null> | null>(null)
  const [vinculos, setVinculos] = useState<Map<string, VinculoExtrato>>(new Map())
  const requisicao = useRef(0)
  const linhasRef = useRef<FinanceiroExtratoTransacao[]>([])
  linhasRef.current = linhas

  async function carregarVinculos(novas: FinanceiroExtratoTransacao[], reiniciar: boolean) {
    if (filtros.status !== 'conciliado') {
      if (reiniciar) setVinculos(new Map())
      return
    }
    try {
      const mapa = await buscarVinculosDasTransacoes(novas)
      setVinculos((prev) => {
        const base = reiniciar ? new Map<string, VinculoExtrato>() : new Map(prev)
        mapa.forEach((v, k) => base.set(k, v))
        return base
      })
    } catch (e) {
      console.error('Erro ao buscar vínculos do extrato:', e)
    }
  }

  /** Primeira página (troca de filtro) — mostra "Carregando"; ou recarga silenciosa depois de uma ação (mantém a lista e a rolagem). */
  async function carregar(silencioso: boolean) {
    const id = ++requisicao.current
    if (!silencioso) setCarregando(true)
    setErroLista('')
    try {
      // recarga silenciosa mantém o mesmo número de linhas que já estavam na tela
      const limite = silencioso ? Math.max(TAMANHO_PAGINA, linhasRef.current.length) : TAMANHO_PAGINA
      const pagina = await buscarPaginaExtrato(filtros, 0, limite)
      if (id !== requisicao.current) return // chegou uma resposta mais nova
      setLinhas(pagina.linhas)
      setTotal(pagina.total)
      carregarVinculos(pagina.linhas, true)
    } catch (e: any) {
      if (id !== requisicao.current) return
      console.error('Erro ao carregar extrato:', e)
      setErroLista('Não foi possível carregar o extrato: ' + (e?.message || 'erro desconhecido'))
    } finally {
      if (id === requisicao.current) setCarregando(false)
    }
  }

  async function carregarMais() {
    setCarregandoMais(true)
    try {
      const pagina = await buscarPaginaExtrato(filtros, linhasRef.current.length, TAMANHO_PAGINA)
      setLinhas((prev) => {
        const vistos = new Set(prev.map((t) => t.id))
        return [...prev, ...pagina.linhas.filter((t) => !vistos.has(t.id))]
      })
      setTotal(pagina.total)
      carregarVinculos(pagina.linhas, false)
    } catch (e: any) {
      setErroLista('Não foi possível carregar mais linhas: ' + (e?.message || 'erro desconhecido'))
    } finally {
      setCarregandoMais(false)
    }
  }

  async function carregarIndicadores() {
    try {
      const [r, c, u] = await Promise.all([buscarResumoPendencias(), buscarContagensStatus(filtros.loja), buscarUltimasImportacoes()])
      setResumo(r)
      setContagens(c)
      setUltimas(u)
    } catch (e) {
      console.error('Erro ao carregar indicadores do extrato:', e)
    }
  }

  useEffect(() => {
    setSelecionados(new Set())
    carregar(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveFiltros])

  useEffect(() => {
    carregarIndicadores()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.loja])

  /** Depois de qualquer ação (conciliar, categorizar, ignorar...): atualiza lista e números sem piscar nem perder a rolagem. */
  function aposAcao() {
    carregar(true)
    carregarIndicadores()
  }

  // --- importação ---
  const [importando, setImportando] = useState(false)
  const [importacaoAberta, setImportacaoAberta] = useState(false)
  const [contaImport, setContaImport] = useState<'loja1' | 'loja2'>('loja1')
  const [msgImportacao, setMsgImportacao] = useState('')
  const [erro, setErro] = useState('')
  const [avisoConta, setAvisoConta] = useState<{
    texto: string
    fp: string
    info: OFXConta
    contaSelecionada: 'loja1' | 'loja2'
    contaAprendida: 'loja1' | 'loja2'
  } | null>(null)

  async function executarImportacao(texto: string, conta: 'loja1' | 'loja2', fp: string | null, info: OFXConta) {
    setImportando(true)
    try {
      const resultado = await importarTransacoesOFX(texto, conta, usuario!.id)
      setMsgImportacao(`${resultado.novas} transação(ões) nova(s) importada(s), ${resultado.duplicadas} já existiam.`)
      aposAcao()
      // Aprender/atualizar o mapeamento é best-effort — não deve derrubar uma
      // importação que já foi concluída com sucesso.
      if (fp) aprenderContaOFX(fp, conta, usuario!.id, info).catch((err) => console.error('Erro ao aprender conta OFX:', err))
    } catch (err: any) {
      console.error(err)
      setErro('Erro ao importar OFX: ' + (err?.message || 'desconhecido'))
    } finally {
      setImportando(false)
    }
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !usuario) return
    setErro('')
    setMsgImportacao('')
    setAvisoConta(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const texto = ev.target?.result as string
      const info = parseOFXConta(texto)
      const fp = fingerprintOFX(info)
      if (fp) {
        try {
          const aprendida = await buscarContaAprendida(fp)
          if (aprendida && aprendida !== contaImport && (aprendida === 'loja1' || aprendida === 'loja2')) {
            setAvisoConta({ texto, fp, info, contaSelecionada: contaImport, contaAprendida: aprendida })
            e.target.value = ''
            return
          }
        } catch (err) {
          console.error('Erro ao checar conta aprendida (seguindo import normal):', err)
        }
      }
      await executarImportacao(texto, contaImport, fp, info)
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // --- seleção e modais ---
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [modalTransacao, setModalTransacao] = useState<FinanceiroExtratoTransacao | null>(null)
  const [modalReceita, setModalReceita] = useState<FinanceiroExtratoTransacao | null>(null)
  const [modalLote, setModalLote] = useState(false)
  const [modalGrupo, setModalGrupo] = useState(false)
  const [modalDespesasLote, setModalDespesasLote] = useState(false)
  const [modalImportacoes, setModalImportacoes] = useState(false)
  const [revertendoId, setRevertendoId] = useState<string | null>(null)

  // "Selecionar todas" continua escopado só a créditos — pra conciliação em
  // grupo de débitos o usuário precisa escolher a dedo as parcelas daquele
  // contrato específico entre possivelmente vários débitos pendentes não
  // relacionados, então "selecionar tudo" não ajudaria nesse caso.
  const creditosPendentesElegiveis = linhas.filter((t) => t.status_conciliacao === 'pendente' && t.valor > 0)
  const transacoesSelecionadas = linhas.filter((t) => selecionados.has(t.id))
  const selecaoTodasCreditos = transacoesSelecionadas.length > 0 && transacoesSelecionadas.every((t) => t.valor > 0)
  const selecaoTodasDebitos = transacoesSelecionadas.length > 0 && transacoesSelecionadas.every((t) => t.valor < 0)
  // Compara por identidade (não só por tamanho) — senão, selecionar 1 débito
  // quando também há 1 crédito pendente faz o rótulo/toggle "achar" por
  // coincidência de contagem que os créditos já estão todos selecionados.
  const todosCreditosSelecionados =
    creditosPendentesElegiveis.length > 0 && creditosPendentesElegiveis.every((t) => selecionados.has(t.id))

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados(todosCreditosSelecionados ? new Set() : new Set(creditosPendentesElegiveis.map((t) => t.id)))
  }

  async function reverterIgnorada(id: string) {
    setRevertendoId(id)
    setErro('')
    try {
      await reverterIgnorarTransacao(id)
      aposAcao()
    } catch (err: any) {
      setErro('Erro ao reverter: ' + (err?.message || 'desconhecido'))
    } finally {
      setRevertendoId(null)
    }
  }

  const restantes = Math.max(total - linhas.length, 0)
  const lojaLabel = (id: string) => (id === 'loja1' || id === 'loja2' ? UNIDADE_LABEL[id] : id)

  return (
    <div className="max-w-6xl mx-auto">
      {/* ---- importação (recolhida por padrão; a lista é o que se usa todo dia) ---- */}
      <div className="bg-white rounded-xl border border-gray-200 mb-3">
        <button
          type="button"
          onClick={() => setImportacaoAberta((v) => !v)}
          aria-expanded={importacaoAberta}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Upload size={16} /> Importar extrato (.ofx)
          </span>
          <span className="flex items-center gap-2 text-xs text-gray-500">
            {ultimas && (
              <span className="hidden sm:flex flex-wrap items-center gap-x-3">
                {CONTAS.map((c) => {
                  const u = ultimas[c.id]
                  if (!u) return <span key={c.id} className="text-amber-700">{c.label}: sem importação</span>
                  const atraso = diasAte(u.ateData)
                  return (
                    <span key={c.id} className={atraso > 3 ? 'text-amber-700 font-medium' : ''}>
                      {c.label}: até {fmtData(u.ateData)}
                      {atraso > 3 ? ` (há ${atraso} dias)` : ''}
                    </span>
                  )
                })}
              </span>
            )}
            {importacaoAberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {importacaoAberta && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loja deste extrato</label>
            <div className="flex gap-2 mb-3">
              {CONTAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setContaImport(c.id)}
                  disabled={importando}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold border-2 disabled:opacity-50 ${
                    contaImport === c.id ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-5 flex flex-col items-center gap-2 text-gray-600 hover:border-pink-400 cursor-pointer">
              {importando ? <Loader size={24} className="animate-spin" /> : <Upload size={24} />}
              <span className="text-sm">{importando ? 'Importando...' : 'Selecionar arquivo .ofx'}</span>
              <input type="file" accept=".ofx,.OFX,text/plain" onChange={onArquivo} disabled={importando} className="hidden" />
            </label>

            {avisoConta && (
              <div className="border-2 border-amber-400 bg-amber-50 rounded-lg p-4 mt-3">
                <p className="text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Este arquivo já foi importado antes como <strong>{UNIDADE_LABEL[avisoConta.contaAprendida]}</strong>, mas a loja
                    selecionada agora é <strong>{UNIDADE_LABEL[avisoConta.contaSelecionada]}</strong>.
                  </span>
                </p>
                <div className="flex gap-2 mt-3 flex-wrap">
                  <button
                    onClick={() => {
                      setContaImport(avisoConta.contaAprendida)
                      executarImportacao(avisoConta.texto, avisoConta.contaAprendida, avisoConta.fp, avisoConta.info)
                      setAvisoConta(null)
                    }}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700"
                  >
                    Usar {UNIDADE_LABEL[avisoConta.contaAprendida]}
                  </button>
                  <button
                    onClick={() => {
                      executarImportacao(avisoConta.texto, avisoConta.contaSelecionada, avisoConta.fp, avisoConta.info)
                      setAvisoConta(null)
                    }}
                    className="px-3 py-1.5 border-2 border-amber-600 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100"
                  >
                    Continuar com {UNIDADE_LABEL[avisoConta.contaSelecionada]}
                  </button>
                  <button onClick={() => setAvisoConta(null)} className="px-3 py-1.5 text-xs text-gray-500">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setModalImportacoes(true)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 mt-3 flex items-center gap-1"
            >
              <History size={13} /> Ver importações recentes / reverter
            </button>
          </div>
        )}
        {(msgImportacao || erro) && (
          <div className="px-4 pb-3">
            {msgImportacao && <p className="text-sm text-green-700">{msgImportacao}</p>}
            {erro && <p className="text-sm text-red-700">{erro}</p>}
          </div>
        )}
      </div>

      {/* ---- resumo das pendências ---- */}
      {resumo && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3" aria-live="polite">
          {resumo.total === 0 ? (
            <p className="text-sm font-semibold text-green-700">✓ Tudo conciliado — nenhuma transação pendente.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <span className="font-bold text-gray-900">{fmtNum(resumo.total)} pendente{resumo.total === 1 ? '' : 's'}</span>
              <button onClick={() => atualizar({ st: 'pendente', tipo: 'entradas' })} className="text-green-700 hover:underline">
                {fmtNum(resumo.entradas.n)} entrada{resumo.entradas.n === 1 ? '' : 's'} · {formatBRL(resumo.entradas.valor)}
              </button>
              <button onClick={() => atualizar({ st: 'pendente', tipo: 'saidas' })} className="text-red-700 hover:underline">
                {fmtNum(resumo.saidas.n)} saída{resumo.saidas.n === 1 ? '' : 's'} · {formatBRL(resumo.saidas.valor)}
              </button>
              {CONTAS.map((c) => (
                <button key={c.id} onClick={() => atualizar({ st: 'pendente', loja: c.id })} className="text-gray-600 hover:underline">
                  {c.label} {fmtNum(resumo.porLoja[c.id])}
                </button>
              ))}
              {resumo.maisAntiga && (
                <span className={diasAte(resumo.maisAntiga) > 7 ? 'text-amber-700 font-medium' : 'text-gray-500'}>
                  mais antiga: {fmtData(resumo.maisAntiga)} (há {diasAte(resumo.maisAntiga)} dia{diasAte(resumo.maisAntiga) === 1 ? '' : 's'})
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- filtros ---- */}
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Situação" className="flex flex-wrap gap-1.5">
            {STATUS_ORDEM.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={filtros.status === s}
                onClick={() => atualizar({ st: s })}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  filtros.status === s ? STATUS_COLOR[s] + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {STATUS_LABEL[s]}
                {contagens && <span className="ml-1 opacity-70">({fmtNum(contagens[s])})</span>}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={buscaDigitada}
              onChange={(e) => setBuscaDigitada(e.target.value)}
              placeholder="Buscar descrição, CNPJ/CPF ou valor (ex.: 70,00)…"
              aria-label="Buscar no extrato"
              className="w-full border border-gray-300 rounded-lg pl-9 pr-8 py-2 text-sm"
            />
            {buscaDigitada && (
              <button
                type="button"
                onClick={() => { setBuscaDigitada(''); atualizar({ q: null }) }}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['todas', ...CONTAS.map((c) => c.id)] as const).map((id) => (
            <button
              key={id}
              onClick={() => atualizar({ loja: id })}
              aria-pressed={filtros.loja === id}
              className={`px-3 py-1 rounded-full text-sm border ${
                filtros.loja === id ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {id === 'todas' ? 'Todas as lojas' : CONTAS.find((c) => c.id === id)!.label}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-200 mx-1" aria-hidden="true" />
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => atualizar({ tipo: t.id })}
              aria-pressed={filtros.tipo === t.id}
              className={`px-3 py-1 rounded-full text-sm border ${
                filtros.tipo === t.id ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
          {!semFiltros && (
            <button
              onClick={() => { setBuscaDigitada(''); atualizar({ loja: null, tipo: null, q: null }) }}
              className="text-xs font-medium text-pink-700 hover:underline ml-1"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ---- seleção em massa ---- */}
      {!carregando && creditosPendentesElegiveis.length > 0 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <button onClick={alternarSelecionarTodos} className="text-xs font-medium text-pink-700 hover:text-pink-800">
            {todosCreditosSelecionados
              ? 'Limpar seleção'
              : `Selecionar as ${creditosPendentesElegiveis.length} entradas pendentes listadas`}
          </button>
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="sticky top-0 z-20 bg-pink-50 border border-pink-200 rounded-xl p-3 mb-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <p className="text-sm text-pink-800 font-medium">
            {selecionados.size} selecionada{selecionados.size > 1 ? 's' : ''} ·{' '}
            {formatBRL(transacoesSelecionadas.reduce((s, t) => s + Math.abs(t.valor), 0))}
          </p>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={() => setSelecionados(new Set())} className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800">
              Cancelar
            </button>
            {selecaoTodasCreditos && (
              <button
                onClick={() => setModalLote(true)}
                className="px-3 py-2 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1.5"
              >
                <Layers size={14} /> Classificar em lote
              </button>
            )}
            {selecaoTodasDebitos && (
              <>
                <button
                  onClick={() => setModalGrupo(true)}
                  className="px-3 py-2 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1.5"
                >
                  <Layers size={14} /> Conciliar em grupo
                </button>
                <button
                  onClick={() => setModalDespesasLote(true)}
                  className="px-3 py-2 border-2 border-pink-700 text-pink-700 rounded-lg text-xs font-semibold hover:bg-pink-50 flex items-center gap-1.5"
                >
                  <Receipt size={14} /> Criar despesas em lote
                </button>
              </>
            )}
            {!selecaoTodasCreditos && !selecaoTodasDebitos && (
              <span className="text-xs text-amber-700">Selecione só entradas ou só saídas</span>
            )}
          </div>
        </div>
      )}

      {/* ---- lista ---- */}
      {erroLista && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{erroLista}</span>
          <button onClick={() => carregar(false)} className="font-semibold underline">Tentar de novo</button>
        </div>
      )}

      {carregando ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : linhas.length === 0 ? (
        filtros.status === 'pendente' && semFiltros ? (
          <EmptyState title="Tudo conciliado" description="Nenhuma transação pendente. Importe o próximo extrato .ofx quando ele sair." />
        ) : (
          <EmptyState
            title={`Nenhuma transação ${STATUS_LABEL[filtros.status].toLowerCase()}${semFiltros ? '' : ' para estes filtros'}`}
            description={semFiltros ? 'Importe um extrato .ofx para começar' : 'Tente outra busca ou limpe os filtros.'}
          />
        )
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-2 px-1">
            Mostrando {fmtNum(linhas.length)} de {fmtNum(total)} · mais recentes primeiro
          </p>
          <ul className="space-y-1.5">
            {linhas.map((t) => {
              const elegivelLote = t.status_conciliacao === 'pendente'
              const vinculo = vinculos.get(t.id)
              return (
                <li
                  key={t.id}
                  className={`bg-white rounded-lg border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 ${
                    selecionados.has(t.id) ? 'border-pink-300 bg-pink-50/40' : 'border-gray-100'
                  }`}
                >
                  {elegivelLote && (
                    <label className="flex items-center justify-center w-11 h-11 sm:w-9 sm:h-9 -ml-2 sm:-ml-1.5 cursor-pointer flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={selecionados.has(t.id)}
                        onChange={() => toggleSelecionado(t.id)}
                        aria-label={`Selecionar ${t.descricao_original} de ${fmtData(t.data)}, ${formatBRL(t.valor)}`}
                        className="w-4 h-4 accent-pink-700"
                      />
                    </label>
                  )}
                  <div className="min-w-0 flex-1 basis-[55%] sm:basis-0">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2 sm:truncate" title={t.descricao_original}>
                      {t.descricao_original}
                    </p>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                      <span>{fmtData(t.data)}</span>
                      {filtros.loja === 'todas' && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-semibold">{lojaLabel(t.conta_bancaria)}</span>
                      )}
                      {t.documento_extraido && <span className="font-mono">{t.documento_extraido}</span>}
                      {t.status_conciliacao === 'conciliado' &&
                        (vinculo ? (
                          <span className="flex items-center gap-1 text-green-700">
                            →{' '}
                            {vinculo.href ? (
                              <Link href={vinculo.href} className="hover:underline inline-flex items-center gap-0.5">
                                {vinculo.rotulo} <ExternalLink size={10} />
                              </Link>
                            ) : (
                              vinculo.rotulo
                            )}
                          </span>
                        ) : (
                          <span className="text-amber-700">→ sem despesa/receita encontrada</span>
                        ))}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                    <p className={`font-semibold tabular-nums ${t.valor < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatBRL(t.valor)}</p>
                    {t.status_conciliacao === 'pendente' && t.valor < 0 && (
                      <button
                        onClick={() => setModalTransacao(t)}
                        className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1"
                      >
                        <Link2 size={14} /> Conciliar
                      </button>
                    )}
                    {t.status_conciliacao === 'pendente' && t.valor > 0 && (
                      <button
                        onClick={() => setModalReceita(t)}
                        className="px-3 py-2 min-h-[44px] sm:min-h-0 bg-green-700 text-white rounded-lg text-xs font-semibold hover:bg-green-800 flex items-center gap-1"
                      >
                        <Tag size={14} /> Categorizar
                      </button>
                    )}
                    {t.status_conciliacao === 'ignorado' && (
                      <button
                        onClick={() => reverterIgnorada(t.id)}
                        disabled={revertendoId === t.id}
                        className="px-3 py-2 min-h-[44px] sm:min-h-0 border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1"
                      >
                        <RotateCcw size={14} /> {revertendoId === t.id ? 'Revertendo...' : 'Reverter'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {restantes > 0 && (
            <div className="text-center mt-4">
              <button
                onClick={carregarMais}
                disabled={carregandoMais}
                className="px-5 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {carregandoMais ? 'Carregando...' : `Carregar mais ${Math.min(TAMANHO_PAGINA, restantes)} (restam ${fmtNum(restantes)})`}
              </button>
            </div>
          )}
        </>
      )}

      {modalTransacao && (
        <ExtratoConciliacaoModal
          transacao={modalTransacao}
          voltarPara={voltarParaAtual}
          onClose={() => setModalTransacao(null)}
          onResolvido={aposAcao}
        />
      )}

      {modalReceita && usuario && (
        <CategorizarReceitaModal
          transacao={modalReceita}
          unidade={modalReceita.conta_bancaria as 'loja1' | 'loja2'}
          usuarioId={usuario.id}
          onClose={() => setModalReceita(null)}
          onResolvido={aposAcao}
        />
      )}

      {modalLote && usuario && (
        <CategorizarReceitasLoteModal
          transacoes={transacoesSelecionadas}
          usuarioId={usuario.id}
          onClose={() => setModalLote(false)}
          onResolvido={() => {
            aposAcao()
            setSelecionados(new Set())
          }}
        />
      )}

      {modalGrupo && (
        <ConciliarGrupoModal
          transacoes={transacoesSelecionadas}
          onClose={() => setModalGrupo(false)}
          onResolvido={() => {
            aposAcao()
            setSelecionados(new Set())
          }}
        />
      )}

      {modalDespesasLote && usuario && (
        <CriarDespesasLoteModal
          transacoes={transacoesSelecionadas}
          usuarioId={usuario.id}
          onClose={() => setModalDespesasLote(false)}
          onResolvido={() => {
            aposAcao()
            setSelecionados(new Set())
          }}
        />
      )}

      {modalImportacoes && (
        <ReverterImportacaoModal onClose={() => setModalImportacoes(false)} onResolvido={aposAcao} />
      )}
    </div>
  )
}
