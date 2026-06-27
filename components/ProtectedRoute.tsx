'use client'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

export default function ProtectedRoute({ children, allowedRoles = [] }: ProtectedRouteProps) {
  const { usuario, carregando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!carregando && usuario && allowedRoles.length > 0) {
      if (!allowedRoles.includes(usuario.role)) {
        console.warn(`Acesso negado para role: ${usuario.role}`)
        router.push('/')
      }
    }
  }, [usuario, carregando, allowedRoles, router])

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    )
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(usuario?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="text-center">
          <p className="text-red-700 font-semibold mb-4">Acesso negado</p>
          <p className="text-sm text-red-600 mb-4">Você não tem permissão para acessar esta página</p>
          <button
            onClick={() => router.push('/')}
            className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    )
  }

  return children
}
