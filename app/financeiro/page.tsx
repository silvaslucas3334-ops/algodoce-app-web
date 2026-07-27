'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import Link from 'next/link'
import { Receipt, ShoppingCart, Users, Package, BookOpen, FileSpreadsheet, Wallet, ClipboardList, TrendingUp, Cake, Layers } from 'lucide-react'
import { formatBRL } from '@/lib/ofx'
import { hojeISO } from '@/lib/financeiro-utils'
import { buscarResumoHubFinanceiro, ResumoHubFinanceiro } from '@/lib/financeiro-fluxo-mensal'

interface Card {
  href: string
  label: string
  desc: string
  icon: typeof Receipt
  roles: string[]
}

// Ordem segue o fluxo real de trabalho (cotar/comprar antes de analisar
// resultado) — Cotações fica perto de Lançar Nota, não isolada no fim.
const GRUPO_MOVIMENTO: Card[] = [
  { href: '/financeiro/despesas', label: 'Despesas', desc: 'Tudo a pagar e pago, de notas e despesas, numa tela só', icon: Receipt, roles: ['admin', 'loja', 'cozinha'] },
  { href: '/financeiro/compras/nova', label: 'Lançar Nota de Insumos', desc: 'Nota fiscal de compra — gera a despesa automaticamente', icon: ShoppingCart, roles: ['admin', 'loja', 'cozinha'] },
  { href: '/financeiro/cotacoes', label: 'Cotações', desc: 'Comparar preços de fornecedores antes de comprar', icon: ClipboardList, roles: ['admin'] },
  { href: '/financeiro/pdv', label: 'Import do PDV', desc: 'Importar vendas do PDV e gerar relatório de faturamento', icon: FileSpreadsheet, roles: ['admin'] },
  { href: '/financeiro/fluxo-caixa', label: 'Fluxo de Caixa', desc: 'Calendário mensal com forecast e conciliação do extrato — orçamento fica em uma tela própria, ligada a partir daqui', icon: Wallet, roles: ['admin'] },
  { href: '/financeiro/dre', label: 'DRE', desc: 'Resultado do mês por competência, com rateio e custo de insumos', icon: TrendingUp, roles: ['admin'] },
]

const GRUPO_CADASTROS: Card[] = [
  { href: '/financeiro/materias-primas', label: 'Matérias-Primas', desc: 'Cadastro controlado e custo médio', icon: Package, roles: ['admin'] },
  { href: '/financeiro/partes', label: 'Fornecedores/Beneficiários', desc: 'Cadastro de quem recebe pagamento', icon: Users, roles: ['admin'] },
  { href: '/financeiro/contas', label: 'Plano de Contas', desc: 'Consulta de centro de custo e conta', icon: BookOpen, roles: ['admin'] },
  { href: '/financeiro/pre-preparos', label: 'Pré-Preparados', desc: 'Massa, recheio, brownie... o que a cozinha produz e usa em outras receitas', icon: Layers, roles: ['admin'] },
  { href: '/financeiro/produtos-finais', label: 'Produtos Finais', desc: 'O que é vendido na loja — combina pré-preparados e/ou matérias-primas, com custo por porção', icon: Cake, roles: ['admin'] },
]

function CardGrid({ titulo, cards }: { titulo: string; cards: Card[] }) {
  const [kpiDespesas, setKpiDespesas] = useState<{ aberto: number; atrasadas: number } | null>(null)
  const [kpiFluxo, setKpiFluxo] = useState<ResumoHubFinanceiro | null>(null)

  useEffect(() => {
    if (cards.some((c) => c.href === '/financeiro/despesas')) {
      const hoje = hojeISO()
      Promise.all([
        supabase.from('financeiro_lancamentos').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
        supabase.from('financeiro_lancamentos').select('id', { count: 'exact', head: true }).eq('status', 'aberto').lt('data_vencimento', hoje),
      ])
        .then(([{ count: aberto }, { count: atrasadas }]) => setKpiDespesas({ aberto: aberto || 0, atrasadas: atrasadas || 0 }))
        .catch((err) => console.error('Erro ao buscar KPI de despesas:', err))
    }
    if (cards.some((c) => c.href === '/financeiro/fluxo-caixa')) {
      buscarResumoHubFinanceiro()
        .then(setKpiFluxo)
        .catch((err) => console.error('Erro ao buscar resumo do fluxo de caixa:', err))
    }
  }, [cards])

  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">{titulo}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all flex items-start gap-4">
              <div className="bg-pink-100 text-pink-700 rounded-lg p-3">
                <c.icon size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{c.label}</p>
                <p className="text-sm text-gray-500 mt-0.5">{c.desc}</p>
                {c.href === '/financeiro/despesas' && kpiDespesas && (
                  <p className="text-xs font-semibold mt-1.5">
                    <span className={kpiDespesas.atrasadas > 0 ? 'text-red-600' : 'text-gray-500'}>
                      {kpiDespesas.aberto} em aberto
                      {kpiDespesas.atrasadas > 0 && ` · ${kpiDespesas.atrasadas} atrasada${kpiDespesas.atrasadas > 1 ? 's' : ''}`}
                    </span>
                  </p>
                )}
                {c.href === '/financeiro/fluxo-caixa' && kpiFluxo && (
                  <p className="text-xs font-semibold mt-1.5 flex flex-wrap gap-x-2">
                    <span className={kpiFluxo.saldoAtual == null ? 'text-amber-600' : kpiFluxo.saldoAtual >= 0 ? 'text-green-700' : 'text-red-600'}>
                      {kpiFluxo.saldoAtual == null ? 'Sem saldo inicial' : `Saldo: ${formatBRL(kpiFluxo.saldoAtual)}`}
                    </span>
                    {kpiFluxo.metaAteHoje > 0 && (
                      <span className={kpiFluxo.faturamentoRealizado >= kpiFluxo.metaAteHoje ? 'text-green-700' : 'text-amber-600'}>
                        · Faturamento {formatBRL(kpiFluxo.faturamentoRealizado)} de {formatBRL(kpiFluxo.metaAteHoje)} (meta até hoje)
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function FinanceiroHubPage() {
  const { usuario } = useAuth()

  const movimentoVisivel = GRUPO_MOVIMENTO.filter((c) => c.roles.includes(usuario?.role || ''))
  const cadastrosVisivel = GRUPO_CADASTROS.filter((c) => c.roles.includes(usuario?.role || ''))

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Financeiro" backHref="/" maxWidth="max-w-4xl" />

        <div className="max-w-4xl mx-auto px-4 py-6">
          {movimentoVisivel.length > 0 && <CardGrid titulo="Movimento & Análise" cards={movimentoVisivel} />}
          {cadastrosVisivel.length > 0 && <CardGrid titulo="Cadastros" cards={cadastrosVisivel} />}
        </div>
      </div>
    </ProtectedRoute>
  )
}
