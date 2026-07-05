'use client'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { ArrowLeft, LogOut, AlertCircle, CheckCircle } from 'lucide-react'
import { LOCAL_LABEL } from '@/lib/constants'

export default function PerfilPage() {
  const { usuario, carregando, logout } = useAuth()
  const router = useRouter()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [senhaConfirm, setSenhaConfirm] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    )
  }

  async function mudarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setSucesso('')

    if (senhaNova !== senhaConfirm) {
      setErro('As senhas não conferem')
      return
    }

    if (senhaNova.length < 6) {
      setErro('A senha deve ter pelo menos 6 caracteres')
      return
    }

    setSalvando(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: senhaNova,
      })

      if (error) {
        setErro(error.message)
      } else {
        setSucesso('Senha alterada com sucesso!')
        setSenhaAtual('')
        setSenhaNova('')
        setSenhaConfirm('')
      }
    } catch (err) {
      setErro('Erro ao alterar senha')
      console.error(err)
    }

    setSalvando(false)
  }

  const getRoleLabel = (role: string) => {
    if (role === 'admin') return 'Administrador'
    if (role === 'cozinha') return 'Funcionário Cozinha'
    return 'Funcionário Loja'
  }

  const getRoleColor = (role: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-700'
    if (role === 'cozinha') return 'bg-blue-100 text-blue-700'
    return 'bg-amber-100 text-amber-700'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft size={22} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Meu Perfil</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Card de Informações */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-400 to-pink-700 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
              {usuario?.nome?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-800">{usuario?.nome}</h2>
                <div className="relative group">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold cursor-help hover:shadow-lg transition-all">
                    🔍
                  </div>
                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-teal-600 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    oluquinhas v1
                  </div>
                </div>
              </div>
              <p className="text-gray-600 mt-1">{usuario?.email}</p>
              <div className="mt-3">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getRoleColor(usuario?.role)}`}>
                  {getRoleLabel(usuario?.role)}
                </span>
              </div>
            </div>
          </div>

          {/* Informações Detalhadas */}
          <div className="space-y-3 border-t border-gray-100 pt-6">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Email:</p>
              <p className="text-sm font-medium text-gray-800">{usuario?.email}</p>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Tipo de Usuário:</p>
              <p className="text-sm font-medium text-gray-800">{getRoleLabel(usuario?.role)}</p>
            </div>
            {usuario?.loja_id && (
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">Local:</p>
                <p className="text-sm font-medium text-gray-800">{LOCAL_LABEL[usuario?.loja_id] || usuario?.loja_id}</p>
              </div>
            )}
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Status:</p>
              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${usuario?.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {usuario?.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
        </div>

        {/* Card de Alterar Senha */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Alterar Senha</h3>

          {erro && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          {sucesso && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-start gap-3">
              <CheckCircle size={18} className="text-green-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-green-700">{sucesso}</p>
            </div>
          )}

          <form onSubmit={mudarSenha} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Senha Atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={e => setSenhaAtual(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
                placeholder="Sua senha atual"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nova Senha</label>
              <input
                type="password"
                required
                value={senhaNova}
                onChange={e => setSenhaNova(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar Senha</label>
              <input
                type="password"
                required
                value={senhaConfirm}
                onChange={e => setSenhaConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-700"
                placeholder="Repita a nova senha"
              />
            </div>

            <button
              type="submit"
              disabled={salvando || !senhaNova}
              className="w-full bg-pink-700 text-white rounded-lg py-2.5 font-semibold disabled:opacity-60 hover:bg-pink-800 transition-colors"
            >
              {salvando ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </div>

        {/* Botão Sair */}
        <div className="flex gap-3">
          <button
            onClick={async () => {
              await logout()
              router.push('/login')
            }}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut size={18} /> Sair da Conta
          </button>
        </div>
      </div>
    </div>
  )
}
