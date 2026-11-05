'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

// Rotas que funcionam sem sessão — todo o resto exige login.
const ROTAS_PUBLICAS = ['/login', '/signup']

/**
 * Portão global de acesso, montado uma vez no layout.
 *
 * - Sem sessão numa rota protegida → manda pro /login. Antes isso era feito
 *   página a página (e 23 páginas, como Estoque e Expedição, nem checavam —
 *   dependiam do banco estar aberto pra anônimos).
 * - Conta criada pelo /signup fica `ativo = false` até o admin liberar em
 *   Admin > Usuários. Até então só aparece a tela "Aguardando liberação".
 *
 * Enquanto a autenticação carrega, não bloqueia nada (as páginas já têm o
 * próprio estado de carregamento) — assim o portão não adiciona espera.
 */
export default function AccessGate({ children }: { children: React.ReactNode }) {
  const { user, usuario, carregando, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const rotaPublica = ROTAS_PUBLICAS.includes(pathname)
  const semSessao = !carregando && !user && !usuario
  // Comparação estrita: linha antiga sem a coluna preenchida (null) não bloqueia.
  const aguardandoLiberacao = !carregando && !!usuario && usuario.ativo === false

  useEffect(() => {
    if (semSessao && !rotaPublica) router.replace('/login')
  }, [semSessao, rotaPublica, router])

  if (aguardandoLiberacao && !rotaPublica) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 border border-gray-100 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock size={28} className="text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">Aguardando liberação</h1>
          <p className="text-sm text-gray-600 mb-1">
            Sua conta{usuario?.nome ? `, ${usuario.nome.split(' ')[0]},` : ''} foi criada, mas o acesso ainda não foi liberado.
          </p>
          <p className="text-sm text-gray-600 mb-6">
            Avise o administrador. Quando ele liberar, toque em &quot;Verificar de novo&quot;.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-pink-700 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-pink-800"
            >
              <RefreshCw size={16} /> Verificar de novo
            </button>
            <button
              onClick={async () => {
                await logout()
                router.replace('/login')
              }}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-gray-50"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
