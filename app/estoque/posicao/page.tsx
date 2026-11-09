'use client'
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, Search } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { LOCAL_LABEL } from '@/lib/constants'
import { exportarCSV } from '@/lib/csv-export'
import {
  buscarEtiquetasDoProduto,
  buscarPosicao,
  buscarProdutosAtivos,
  CABECALHO_CSV,
  Celula,
  classeValidade,
  ColunaOrdem,
  EtiquetaEstoque,
  filtrarGrade,
  FiltroRapido,
  FiltrosPosicao,
  linhasCsv,
  montarGrade,
  ordenarGrade,
  resumirGrade,
  UnidadeEstoque,
} from '@/lib/estoque-posicao'

const RAPIDOS: { key: FiltroRapido; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'vence7', label: 'Vence em 7 dias' },
  { key: 'vencidos', label: 'Vencidos' },
  { key: 'a_caminho', label: 'A caminho' },
  { key: 'sem_estoque', label: 'Sem estoque' },
]

const COLUNAS: { key: ColunaOrdem; label: string; alinhar: 'left' | 'center' }[] = [
  { key: 'nome', label: 'Produto', alinhar: 'left' },
  { key: 'cozinha', label: 'Cozinha', alinhar: 'center' },
  { key: 'loja1', label: 'Paraisópolis', alinhar: 'center' },
  { key: 'loja2', label: 'Itajubá', alinhar: 'center' },
  { key: 'total', label: 'Total', alinhar: 'center' },
  { key: 'aCaminho', label: 'A caminho', alinhar: 'center' },
  { key: 'validade', label: 'Próx. validade', alinhar: 'center' },
  { key: 'vencidas', label: 'Vencidas', alinhar: 'center' },
]

const fmtData = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

function abreviar(unidade: string): string {
  const u = unidade.toLowerCase()
  if (u.startsWith('gram')) return 'g'
  if (u.startsWith('unid')) return 'un'
  if (u.startsWith('quil') || u === 'kg') return 'kg'
  return unidade
}

/** Etiquetas em destaque; a quantidade/peso aparece embaixo só quando difere da contagem. */
function CelulaEstoque({ c, unidadeMedida }: { c: Celula; unidadeMedida: string }) {
  if (c.etiquetas === 0) return <span className="text-gray-300">—</span>
  return (
    <div>
      <span className="font-semibold text-gray-800">{c.etiquetas}</span>
      {c.quantidade > 0 && c.quantidade !== c.etiquetas && (
        <span className="block text-[11px] text-gray-400">{fmtNum(c.quantidade)} {abreviar(unidadeMedida)}</span>
      )}
    </div>
  )
}

function PosicaoContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const ordemParam = searchParams.get('ord') as ColunaOrdem | null
  const filtros: FiltrosPosicao = {
    q: searchParams.get('q') || '',
    categoria: searchParams.get('cat') || '',
    unidade: (['cozinha', 'loja1', 'loja2'].includes(searchParams.get('un') || '') ? searchParams.get('un') : '') as FiltrosPosicao['unidade'],
    rapido: (RAPIDOS.some((r) => r.key === searchParams.get('f')) ? searchParams.get('f') : 'todos') as FiltroRapido,
    ordem: ordemParam && COLUNAS.some((c) => c.key === ordemParam) ? ordemParam : 'nome',
    desc: searchParams.get('dir') === 'desc',
  }

  const atualizar = useCallback(
    (parcial: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString())
      Object.entries(parcial).forEach(([k, v]) => {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      })
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, pathname, router]
  )

  // busca por texto com debounce antes de mexer na URL
  const [buscaDigitada, setBuscaDigitada] = useState(filtros.q)
  useEffect(() => { setBuscaDigitada(filtros.q) }, [filtros.q])
  useEffect(() => {
    if (buscaDigitada === filtros.q) return
    const t = setTimeout(() => atualizar({ q: buscaDigitada }), 300)
    return () => clearTimeout(t)
  }, [buscaDigitada, filtros.q, atualizar])

  const [linhas, setLinhas] = useState<Awaited<ReturnType<typeof buscarPosicao>>>([])
  const [produtos, setProdutos] = useState<Awaited<ReturnType<typeof buscarProdutosAtivos>>>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [etiquetas, setEtiquetas] = useState<Record<string, EtiquetaEstoque[] | 'carregando' | 'erro'>>({})

  useEffect(() => {
    let cancelado = false
    Promise.all([buscarPosicao(), buscarProdutosAtivos()])
      .then(([l, p]) => {
        if (cancelado) return
        setLinhas(l)
        setProdutos(p)
      })
      .catch((e: any) => {
        if (!cancelado) setErro('Erro ao carregar a posição de estoque: ' + (e?.message || 'desconhecido'))
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => { cancelado = true }
  }, [])

  const grade = useMemo(() => montarGrade(linhas, produtos), [linhas, produtos])
  const resumo = useMemo(() => resumirGrade(grade), [grade])
  const categorias = useMemo(() => Array.from(new Set(grade.map((p) => p.categoria))).sort((a, b) => a.localeCompare(b)), [grade])
  const visiveis = useMemo(
    () => ordenarGrade(filtrarGrade(grade, filtros), filtros.ordem, filtros.desc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grade, filtros.q, filtros.categoria, filtros.unidade, filtros.rapido, filtros.ordem, filtros.desc]
  )

  async function alternar(produtoId: string) {
    const novo = new Set(expandidos)
    if (novo.has(produtoId)) {
      novo.delete(produtoId)
      setExpandidos(novo)
      return
    }
    novo.add(produtoId)
    setExpandidos(novo)
    if (etiquetas[produtoId] && etiquetas[produtoId] !== 'erro') return
    setEtiquetas((prev) => ({ ...prev, [produtoId]: 'carregando' }))
    try {
      const lista = await buscarEtiquetasDoProduto(produtoId)
      setEtiquetas((prev) => ({ ...prev, [produtoId]: lista }))
    } catch {
      setEtiquetas((prev) => ({ ...prev, [produtoId]: 'erro' }))
    }
  }

  function ordenarPor(col: ColunaOrdem) {
    if (filtros.ordem === col) atualizar({ dir: filtros.desc ? null : 'desc' })
    else atualizar({ ord: col === 'nome' ? null : col, dir: col === 'nome' ? null : 'desc' })
  }

  function onde(e: EtiquetaEstoque): string {
    if (e.status === 'na_cozinha') return 'Cozinha'
    if (e.status === 'na_loja') return LOCAL_LABEL[e.destino || ''] || e.destino || '—'
    return `A caminho → ${LOCAL_LABEL[e.destino || ''] || e.destino || '—'}`
  }

  const tile = (rotulo: string, valor: number, tom: 'neutro' | 'laranja' | 'vermelho' | 'azul') => {
    const cores = {
      neutro: 'bg-white border-gray-200 text-gray-800',
      laranja: valor > 0 ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-gray-200 text-gray-800',
      vermelho: valor > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-800',
      azul: valor > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-800',
    }[tom]
    return (
      <div className={`rounded-lg border p-3 ${cores}`}>
        <p className="text-xs text-gray-500">{rotulo}</p>
        <p className="text-2xl font-bold mt-0.5">{valor}</p>
      </div>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Posição de Estoque" backHref="/estoque" maxWidth="max-w-7xl" />

        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {tile('Etiquetas em estoque', resumo.etiquetas, 'neutro')}
            {tile('Produtos com estoque', resumo.produtosComEstoque, 'neutro')}
            {tile('Vencem em 7 dias', resumo.vence7d, 'laranja')}
            {tile('Vencidas', resumo.vencidas, 'vermelho')}
            {tile('A caminho', resumo.aCaminho, 'azul')}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  value={buscaDigitada}
                  onChange={(e) => setBuscaDigitada(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <select
                value={filtros.categoria}
                onChange={(e) => atualizar({ cat: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={filtros.unidade}
                onChange={(e) => atualizar({ un: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="">Todas as unidades</option>
                {(['cozinha', 'loja1', 'loja2'] as UnidadeEstoque[]).map((u) => (
                  <option key={u} value={u}>{LOCAL_LABEL[u]}</option>
                ))}
              </select>
              <button
                onClick={() => exportarCSV(linhasCsv(visiveis), CABECALHO_CSV, 'posicao-estoque')}
                disabled={visiveis.length === 0}
                className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                <Download size={16} /> CSV
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {RAPIDOS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => atualizar({ f: r.key === 'todos' ? null : r.key })}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    filtros.rapido === r.key ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <span className="text-xs text-gray-400 ml-auto self-center">
                {visiveis.length} produto{visiveis.length === 1 ? '' : 's'}
                {filtros.unidade && ` · só ${LOCAL_LABEL[filtros.unidade]}`}
              </span>
            </div>
          </div>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="w-8" />
                    {COLUNAS.map((c) => (
                      <th key={c.key} className={`px-3 py-2 font-semibold text-gray-600 whitespace-nowrap ${c.alinhar === 'left' ? 'text-left' : 'text-center'}`}>
                        <button onClick={() => ordenarPor(c.key)} className="inline-flex items-center gap-1 hover:text-gray-900">
                          {c.label}
                          {filtros.ordem === c.key && (filtros.desc ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const aberto = expandidos.has(p.produtoId)
                    const lista = etiquetas[p.produtoId]
                    return (
                      <Fragment key={p.produtoId}>
                        <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => alternar(p.produtoId)}>
                          <td className="pl-3 text-gray-400">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-gray-800">{p.nome}</p>
                            <p className="text-xs text-gray-400">{p.categoria}</p>
                          </td>
                          <td className="px-3 py-2 text-center"><CelulaEstoque c={p.cozinha} unidadeMedida={p.unidadeMedida} /></td>
                          <td className="px-3 py-2 text-center"><CelulaEstoque c={p.loja1} unidadeMedida={p.unidadeMedida} /></td>
                          <td className="px-3 py-2 text-center"><CelulaEstoque c={p.loja2} unidadeMedida={p.unidadeMedida} /></td>
                          <td className="px-3 py-2 text-center bg-gray-50/60"><CelulaEstoque c={p.total} unidadeMedida={p.unidadeMedida} /></td>
                          <td className="px-3 py-2 text-center">
                            {p.aCaminho.etiquetas > 0 ? <span className="font-semibold text-blue-600">{p.aCaminho.etiquetas}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-center whitespace-nowrap ${classeValidade(p.total.proxima)}`}>
                            {p.total.proxima ? fmtData(p.total.proxima) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {p.total.vencidas > 0 ? <span className="font-semibold text-red-600">{p.total.vencidas}</span> : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-gray-50/70 border-b border-gray-100">
                            <td />
                            <td colSpan={8} className="px-3 py-3">
                              {lista === 'carregando' || !lista ? (
                                <span className="text-xs text-gray-400">Carregando etiquetas...</span>
                              ) : lista === 'erro' ? (
                                <span className="text-xs text-red-600">Não foi possível carregar as etiquetas.</span>
                              ) : lista.length === 0 ? (
                                <span className="text-xs text-gray-400">Nenhuma etiqueta em estoque ou a caminho.</span>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500 text-left">
                                      <th className="py-1 pr-3 font-semibold">Etiqueta</th>
                                      <th className="py-1 pr-3 font-semibold">Onde está</th>
                                      <th className="py-1 pr-3 font-semibold">Validade</th>
                                      <th className="py-1 pr-3 font-semibold">Produzida em</th>
                                      <th className="py-1 font-semibold">Quantidade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lista.map((e) => (
                                      <tr key={e.id} className="border-t border-gray-200">
                                        <td className="py-1 pr-3 font-mono text-gray-700">{e.codigo_qr}</td>
                                        <td className={`py-1 pr-3 ${e.status === 'enviado' ? 'text-blue-600' : 'text-gray-700'}`}>{onde(e)}</td>
                                        <td className={`py-1 pr-3 ${classeValidade(e.data_validade)}`}>{fmtData(e.data_validade)}</td>
                                        <td className="py-1 pr-3 text-gray-500">{e.data_producao ? fmtData(e.data_producao) : '—'}</td>
                                        <td className="py-1 text-gray-700">
                                          {fmtNum(Number(e.quantidade) || Number(e.peso_gramas) || 0)} {abreviar(p.unidadeMedida)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
              {visiveis.length === 0 && <div className="text-center py-10 text-gray-400">Nenhum produto neste filtro.</div>}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}

export default function PosicaoEstoquePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>}>
      <PosicaoContent />
    </Suspense>
  )
}
