'use client'
import ProtectedRoute from '@/components/ProtectedRoute'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Layers, Cake } from 'lucide-react'

const CARDS = [
  { href: '/financeiro/pre-preparos', label: 'Pré-Preparados', desc: 'Massa, recheio, brownie... o que a cozinha produz e usa em outras receitas', icon: Layers },
  { href: '/financeiro/produtos-finais', label: 'Produtos Finais', desc: 'O que é vendido na loja — combina pré-preparados e/ou matérias-primas, com custo por porção', icon: Cake },
]

export default function FichaTecnicaHubPage() {
  const router = useRouter()

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Ficha Técnica / CMV</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-sm text-gray-500 mb-4">
            Hierarquia de custo: matéria-prima → pré-preparo → produto final. Cadastre primeiro os pré-preparados usados nas receitas, depois os produtos finais vendidos na loja.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CARDS.map((c) => (
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
