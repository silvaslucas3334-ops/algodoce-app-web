'use client'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import FornecedorCombobox, { OpcaoFornecedor } from '@/components/FornecedorCombobox'
import ComprasPorInsumo from '@/components/compras/ComprasPorInsumo'
import ComprasPorCompra from '@/components/compras/ComprasPorCompra'
import ComprasMelhorCompra from '@/components/compras/ComprasMelhorCompra'
import ComprasCotacoes from '@/components/compras/ComprasCotacoes'
import { intervaloDoPeriodo, OrdemItens, Periodo, PERIODOS } from '@/lib/financeiro-compras'

type Aba = 'insumo' | 'compra' | 'melhor' | 'cotacoes'

const ABAS: { key: Aba; label: string; soAdmin: boolean }[] = [
  { key: 'insumo', label: 'Por insumo', soAdmin: true },
  { key: 'compra', label: 'Por compra', soAdmin: true },
  { key: 'melhor', label: 'Melhor compra', soAdmin: true },
  { key: 'cotacoes', label: 'Cotações', soAdmin: false },
]

// Período padrão de cada aba: preço subindo se vê em janela longa (90 dias); a lista de
// notas é do dia a dia (este mês).
const PERIODO_PADRAO: Record<Aba, Periodo> = { insumo: '90d', compra: 'mes', melhor: '90d', cotacoes: '90d' }
const PERIODOS_VALIDOS = PERIODOS.map((p) => p.key)

/**
 * Módulo Compras — reúne o que antes estava espalhado: lista de compras por item (era
 * Matérias-Primas > Compras), Melhor compra (era Matérias-Primas > Melhor Compra) e
 * Cotações (era um card próprio no hub). Filtros e aba vivem na URL.
 * Loja e cozinha só veem Cotações e o botão de lançar nota; a análise de preços é do admin.
 */
function ComprasContent() {
  const { usuario } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ehAdmin = usuario?.role === 'admin'

  const queryAtual = searchParams.toString()
  const urlAtual = queryAtual ? `${pathname}?${queryAtual}` : pathname

  const abasVisiveis = ABAS.filter((a) => ehAdmin || !a.soAdmin)
  const abaParam = searchParams.get('aba') as Aba | null
  const aba: Aba = abaParam && abasVisiveis.some((a) => a.key === abaParam) ? abaParam : ehAdmin ? 'insumo' : 'cotacoes'

  const periodoParam = searchParams.get('p') as Periodo | null
  const periodo: Periodo = periodoParam && PERIODOS_VALIDOS.includes(periodoParam) ? periodoParam : PERIODO_PADRAO[aba]
  const de = searchParams.get('de') || ''
  const ate = searchParams.get('ate') || ''
  const parteId = searchParams.get('parte') || ''
  const busca = searchParams.get('q') || ''
  const materiaPrimaId = searchParams.get('mp') || ''
  const ordem = (['data', 'valor', 'insumo'].includes(searchParams.get('ord') || '') ? searchParams.get('ord') : 'data') as OrdemItens
  const visaoMelhor = searchParams.get('mv') === 'fornecedor' ? 'fornecedor' : 'insumo'
  const fornecedorMelhor = searchParams.get('forn') || ''

  const { inicio, fim } = useMemo(() => intervaloDoPeriodo(periodo, de, ate), [periodo, de, ate])

  const atualizar = useCallback(
    (parcial: Record<string, string | null>) => {
      const p = new URLSearchParams(searchParams.toString())
      Object.entries(parcial).forEach(([chave, valor]) => {
        if (valor === null || valor === '') p.delete(chave)
        else p.set(chave, valor)
      })
      const qs = p.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, pathname, router]
  )

  // Busca por texto: debounce de 350 ms antes de mexer na URL.
  const [buscaDigitada, setBuscaDigitada] = useState(busca)
  useEffect(() => { setBuscaDigitada(busca) }, [busca])
  useEffect(() => {
    if (buscaDigitada === busca) return
    const t = setTimeout(() => atualizar({ q: buscaDigitada }), 350)
    return () => clearTimeout(t)
  }, [buscaDigitada, busca, atualizar])

  const [fornecedores, setFornecedores] = useState<OpcaoFornecedor[]>([])
  useEffect(() => {
    if (!ehAdmin) return
    supabase
      .from('financeiro_partes')
      .select('id, nome')
      .eq('papel_fornecedor', true)
      .order('nome')
      .range(0, 4999)
      .then(({ data }) => setFornecedores((data || []) as OpcaoFornecedor[]))
  }, [ehAdmin])

  const mostrarFiltros = ehAdmin && (aba === 'insumo' || aba === 'compra')

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="Compras"
          backHref="/financeiro"
          maxWidth="max-w-5xl"
          actions={
            <Link
              href="/financeiro/compras/nova"
              className="bg-pink-700 text-white rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-1.5 hover:bg-pink-800"
            >
              <ShoppingCart size={16} /> Lançar Nota
            </Link>
          }
        />

        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
            {abasVisiveis.map((a) => (
              <button
                key={a.key}
                onClick={() => atualizar(a.key === aba ? {} : { aba: a.key, mp: null, mv: null, forn: null })}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap border ${
                  aba === a.key ? 'bg-pink-700 text-white border-pink-700 font-semibold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {mostrarFiltros && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {PERIODOS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => atualizar({ p: p.key === PERIODO_PADRAO[aba] ? null : p.key })}
                    className={`px-3 py-1 rounded-full text-xs border ${
                      periodo === p.key ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {periodo === 'custom' && (
                <div className="flex items-center gap-2">
                  <input type="date" value={de || inicio} onChange={(e) => atualizar({ de: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <span className="text-gray-400 text-xs">até</span>
                  <input type="date" value={ate || fim} onChange={(e) => atualizar({ ate: e.target.value })} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <FornecedorCombobox valorId={parteId} opcoes={fornecedores} onChange={(id) => atualizar({ parte: id })} />
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    value={buscaDigitada}
                    onChange={(e) => setBuscaDigitada(e.target.value)}
                    placeholder="Buscar insumo..."
                    className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                <span className="text-xs text-gray-400 ml-auto">
                  {new Date(inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}

          {aba === 'insumo' && ehAdmin && (
            <ComprasPorInsumo inicio={inicio} fim={fim} parteId={parteId} busca={busca} onVerCompras={(mp) => atualizar({ aba: 'compra', mp, p: periodo })} />
          )}
          {aba === 'compra' && ehAdmin && (
            <ComprasPorCompra
              inicio={inicio}
              fim={fim}
              parteId={parteId}
              busca={busca}
              materiaPrimaId={materiaPrimaId}
              ordem={ordem}
              urlAtual={urlAtual}
              onOrdem={(o) => atualizar({ ord: o === 'data' ? null : o })}
              onLimparInsumo={() => atualizar({ mp: null })}
            />
          )}
          {aba === 'melhor' && ehAdmin && (
            <ComprasMelhorCompra
              visao={visaoMelhor}
              fornecedorId={fornecedorMelhor}
              onVisao={(v) => atualizar({ mv: v === 'insumo' ? null : v, forn: null })}
              onFornecedor={(id) => atualizar({ forn: id })}
            />
          )}
          {aba === 'cotacoes' && <ComprasCotacoes />}
        </div>
      </div>
    </ProtectedRoute>
  )
}

export default function ComprasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Carregando...</div>}>
      <ComprasContent />
    </Suspense>
  )
}
