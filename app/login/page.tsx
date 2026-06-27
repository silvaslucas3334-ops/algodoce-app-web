'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

export default function LoginPage() {
  const router = useRouter()
  const { usuario, carregando: carregandoAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  // Redirecionar se já está logado
  useEffect(() => {
    if (usuario && !carregandoAuth) {
      router.replace('/')
    }
  }, [usuario, carregandoAuth, router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      })

      if (error) {
        setErro(error.message)
        setCarregando(false)
        return
      }

      if (data.user) {
        // Verificar se usuário existe na tabela usuarios
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', data.user.id)
          .single()

        if (!usuario) {
          setErro('Usuário não encontrado na base de dados')
          await supabase.auth.signOut()
          setCarregando(false)
          return
        }

        // Redirecionar para dashboard
        router.push('/')
      }
    } catch (err) {
      setErro('Erro ao fazer login')
      console.error(err)
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image src="/logo.png" alt="AlgoDoce" width={80} height={80} className="object-contain" />
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">AlgoDoce</h1>
          <p className="text-center text-gray-500 text-sm mb-8">Gestão de Produção</p>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
              <input
                type="password"
                required
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-semibold disabled:opacity-60 hover:bg-pink-800 transition-colors"
            >
              {carregando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              Não tem conta?{' '}
              <button
                onClick={() => router.push('/signup')}
                className="text-pink-700 font-medium hover:underline"
              >
                Criar nova
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          © 2026 AlgoDoce. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}
