'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { FinanceiroProdutoFinal } from '@/lib/types'
import { formatBRL } from '@/lib/ofx'
import { STATUS_FICHA_TECNICA_LABEL, STATUS_FICHA_TECNICA_COLOR } from '@/lib/constants'
import { buscarCustosAtuaisMateriasPrimas, calcularCustoPrePreparo, calcularCustoProdutoFinal } from '@/lib/financeiro-cmv'

export default function ProdutosFinaisPage() {
  const [produtos, setProdutos] = useState<FinanceiroProdutoFinal[]>([])
  const [custos, setCustos] = useState<Record<string, ReturnType<typeof calcularCustoProdutoFinal>>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('financeiro_produtos_finais')
      .select('*, itens:financeiro_produto_final_itens(*, materia_prima:financeiro_materias_primas(nome), pre_preparo:financeiro_pre_preparos(nome, unidade_medida, rendimento_quantidade))')
      .order('nome')
    const lista = data || []
    setProdutos(lista)

    // Pré-preparos referenciados precisam da própria receita pra calcular
    // o custo por unidade deles antes de calcular o do produto final.
    const idsPrePreparo = Array.from(
      new Set(lista.flatMap((p: any) => (p.itens || []).map((i: any) => i.pre_preparo_id).filter(Boolean)))
    )
    const { data: prePreparosData } = idsPrePreparo.length
      ? await supabase
          .from('financeiro_pre_preparos')
          .select('*, itens:financeiro_pre_preparo_itens(*, materia_prima:financeiro_materias_primas(nome))')
          .in('id', idsPrePreparo)
      : { data: [] }

    const idsMateriaPrima = Array.from(
      new Set([
        ...lista.flatMap((p: any) => (p.itens || []).map((i: any) => i.materia_prima_id).filter(Boolean)),
        ...(prePreparosData || []).flatMap((pp: any) => (pp.itens || []).map((i: any) => i.materia_prima_id)),
      ])
    )
    const custosMP = await buscarCustosAtuaisMateriasPrimas(idsMateriaPrima)

    const custosPP = new Map((prePreparosData || []).map((pp: any) => [pp.id, calcularCustoPrePreparo(pp, custosMP)]))

    const mapa: Record<string, ReturnType<typeof calcularCustoProdutoFinal>> = {}
    lista.forEach((p: any) => {
      mapa[p.id] = calcularCustoProdutoFinal(p, custosMP, custosPP)
    })
    setCustos(mapa)
    setLoading(false)
  }

  const filtrados = produtos.filter(
    (p) => p.nome.toLowerCase().includes(busca.trim().toLowerCase()) && (!soPendentes || p.status === 'pendente_revisao')
  )

  return (
    <ProtectedRoute allowedRoles={['admin', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader
          title="Produtos Finais"
          backHref="/financeiro"
          maxWidth="max-w-4xl"
          actions={
            <Link
              href="/financeiro/produtos-finais/nova"
              className="bg-pink-700 text-white rounded-lg px-4 py-2 font-semibold flex items-center gap-2 hover:bg-pink-800"
            >
              <Plus size={18} /> Novo
            </Link>
          }
        />

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produto final..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2 mb-4">
            {[
              { key: false, label: 'Todos' },
              { key: true, label: 'Pendentes de revisão' },
            ].map((f) => (
              <button
                key={String(f.key)}
                onClick={() => setSoPendentes(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  soPendentes === f.key ? 'bg-amber-600 border-amber-600 text-white' : 'bg-white border-gray-300 text-gray-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <EmptyState
              title="Nenhum produto final cadastrado"
              description="Cadastre aqui os itens vendidos na loja, combinando pré-preparados e/ou matérias-primas direto"
            />
          ) : (
            <div className="space-y-2">
              {filtrados.map((p) => {
                const custo = custos[p.id]
                return (
                  <Link key={p.id} href={`/financeiro/produtos-finais/${p.id}`}>
                    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{p.nome}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {p.rendimento_porcoes > 1 ? `${p.rendimento_porcoes} porções` : 'Vendido inteiro'}
                            {(p.codigo_pdv_loja1 || p.codigo_pdv_loja2) &&
                              ` · PDV ${[p.codigo_pdv_loja1, p.codigo_pdv_loja2].filter(Boolean).join(' / ')}`}
                          </p>
                        </div>
                        <div className="text-right">
                          {!custo || (p.itens || []).length === 0 ? (
                            <p className="text-xs text-gray-400">Sem itens</p>
                          ) : custo.custoTotal != null ? (
                            <p className="text-sm font-semibold text-gray-800">
                              {formatBRL(custo.custoPorPorcao!)}
                              {p.rendimento_porcoes > 1 && <span className="text-xs text-gray-400">/porção</span>}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600">Custo incompleto</p>
                          )}
                          {!p.ativo && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inativo</span>}
                          {p.status === 'pendente_revisao' && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ml-1 ${STATUS_FICHA_TECNICA_COLOR.pendente_revisao}`}>
                              {STATUS_FICHA_TECNICA_LABEL.pendente_revisao}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
