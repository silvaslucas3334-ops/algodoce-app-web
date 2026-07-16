'use client'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt, ShoppingCart, Users, Package, BookOpen, Landmark, FileSpreadsheet, Wallet, ClipboardList, TrendingUp, Cake } from 'lucide-react'

export default function FinanceiroHubPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const cards = [
    { href: '/financeiro/despesas', label: 'Despesas', desc: 'Tudo a pagar e pago, de notas e despesas, numa tela só', icon: Receipt, roles: ['admin', 'loja', 'cozinha'] },
    { href: '/financeiro/compras/nova', label: 'Lançar Nota de Insumos', desc: 'Nota fiscal de compra — gera a despesa automaticamente', icon: ShoppingCart, roles: ['admin', 'loja', 'cozinha'] },
    { href: '/financeiro/materias-primas', label: 'Matérias-Primas', desc: 'Cadastro controlado e custo médio', icon: Package, roles: ['admin'] },
    { href: '/financeiro/partes', label: 'Fornecedores/Beneficiários', desc: 'Cadastro de quem recebe pagamento', icon: Users, roles: ['admin'] },
    { href: '/financeiro/contas', label: 'Plano de Contas', desc: 'Consulta de centro de custo e conta', icon: BookOpen, roles: ['admin'] },
    { href: '/financeiro/extrato', label: 'Extrato Bancário', desc: 'Importar OFX e conciliar pagamentos', icon: Landmark, roles: ['admin'] },
    { href: '/financeiro/pdv', label: 'Import do PDV', desc: 'Importar vendas do PDV e gerar relatório de faturamento', icon: FileSpreadsheet, roles: ['admin'] },
    { href: '/financeiro/fluxo-caixa', label: 'Fluxo de Caixa', desc: 'Categorizar entradas do extrato e ver o saldo do mês por loja', icon: Wallet, roles: ['admin'] },
    { href: '/financeiro/dre', label: 'DRE', desc: 'Resultado do mês por competência, com rateio e custo de insumos', icon: TrendingUp, roles: ['admin'] },
    { href: '/financeiro/ficha-tecnica', label: 'Ficha Técnica / CMV', desc: 'Pré-preparados e produtos finais, com custo hierarquizado por receita', icon: Cake, roles: ['admin'] },
    { href: '/financeiro/cotacoes', label: 'Cotações', desc: 'Comparar preços de fornecedores antes de comprar', icon: ClipboardList, roles: ['admin'] },
  ]

  const cardsVisiveis = cards.filter((c) => c.roles.includes(usuario?.role))

  return (
    <ProtectedRoute allowedRoles={['admin', 'loja', 'cozinha']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Financeiro</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cardsVisiveis.map((c) => (
              <Link key={c.href} href={c.href}>
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-gray-200 cursor-pointer transition-all flex items-start gap-4">
                  <div className="bg-pink-100 text-pink-700 rounded-lg p-3">
                    <c.icon size={22} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{c.label}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{c.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
