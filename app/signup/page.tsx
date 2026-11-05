'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, AlertCircle } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro('')

    try {
      // A linha em `usuarios` NÃO é criada aqui: um trigger no servidor
      // (lib/migrations/seguranca-cadastro-pendente.sql) cria já como pendente
      // (ativo = false, sem função/loja). Função e loja o administrador define
      // em Admin > Usuários, que também libera o acesso. Nada de papel vindo
      // do navegador.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      })

      if (authError) {
        setErro(authError.message)
        setCarregando(false)
        return
      }

      if (authData.user) {
        setSucesso(true)
        setTimeout(() => {
          router.push('/login')
        }, 3500)
      }
    } catch (err) {
      setErro('Erro ao criar conta')
      console.error(err)
      setCarregando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => router.push('/login')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-8"
        >
          <ArrowLeft size={18} /> Voltar ao login
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <div className="flex justify-center mb-8">
            <Image src="/logo.png" alt="AlgoDoce" width={80} height={80} className="object-contain" />
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">Criar Conta</h1>
          <p className="text-center text-gray-500 text-sm mb-8">AlgoDoce - Gestão de Produção</p>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          {sucesso && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-700 font-medium">✓ Conta criada! Agora é só aguardar o administrador liberar o seu acesso.</p>
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nome Completo</label>
              <input
                type="text"
                required
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
              />
            </div>

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

            <p className="text-xs text-gray-500">
              Depois de criar a conta, o administrador define a sua função e libera o acesso.
            </p>

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-semibold disabled:opacity-60 hover:bg-pink-800 transition-colors"
            >
              {carregando ? 'Criando conta...' : 'Criar Conta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
