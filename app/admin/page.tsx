'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { LogOut, Package, BarChart3, Users, Tag } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import ProdutosTab from './produtos'
import RelatoriosTab from './relatorios'
import UsuariosTab from './usuarios'
import CategoriasTab from './categorias'

function AdminContent() {
  const { usuario, logout } = useAuth()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get('tab') || 'produtos') as 'produtos' | 'categorias' | 'relatorios' | 'usuarios'
  const [abaAtiva, setAbaAtiva] = useState<'produtos' | 'categorias' | 'relatorios' | 'usuarios'>(tabParam)

  useEffect(() => {
    setAbaAtiva(tabParam)
  }, [tabParam])

  const abas = [
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'categorias', label: 'Categorias', icon: Tag },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
    { id: 'usuarios', label: 'Usuários', icon: Users },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Alert */}
      <div className="bg-red-600 text-white px-4 py-2 text-center text-sm font-medium">
        🔒 Painel de Gestão - Acesso Restrito a Administradores
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="AlgoDoce" width={40} height={40} className="object-contain" />
            <div>
              <h1 className="font-bold text-gray-800">Administrador</h1>
              <p className="text-xs text-gray-500">AlgoDoce</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {usuario && (
              <div className="text-right text-sm">
                <p className="font-medium text-gray-800">{usuario.nome}</p>
                <p className="text-xs text-gray-500">{usuario.email}</p>
              </div>
            )}
            <button
              onClick={logout}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg p-2 transition-colors"
              title="Sair"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {abas.map((aba: any) => {
              const Icon = aba.icon
              const isActive = abaAtiva === aba.id
              return (
                <button
                  key={aba.id}
                  onClick={() => setAbaAtiva(aba.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                    isActive
                      ? 'text-pink-700 border-pink-700'
                      : 'text-gray-600 border-transparent hover:text-gray-800'
                  }`}
                >
                  <Icon size={18} />
                  {aba.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {abaAtiva === 'produtos' && <ProdutosTab />}
        {abaAtiva === 'categorias' && <CategoriasTab />}
        {abaAtiva === 'relatorios' && <RelatoriosTab />}
        {abaAtiva === 'usuarios' && <UsuariosTab />}
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminContent />
    </ProtectedRoute>
  )
}
