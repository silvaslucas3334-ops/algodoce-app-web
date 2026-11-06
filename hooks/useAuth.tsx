'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  user: any
  usuario: any
  carregando: boolean
  erro: string | null
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Quanto tempo uma aba pode ficar em segundo plano antes de, ao voltar, a
// linha de `usuarios` ser relida (pega mudança de função/loja/ativo feita pelo admin).
const RELER_USUARIO_APOS_MS = 10 * 60 * 1000

/**
 * Estado de autenticação ÚNICO pro app inteiro (montado em app/layout.tsx).
 *
 * Antes, cada componente que chamava useAuth() criava o próprio estado e
 * refazia getSession + a consulta em `usuarios`: a tela de Estoque disparava
 * 3 vezes a mesma consulta, e cada página nova nascia com `usuario = null`
 * (por isso o Estoque desenhava a versão do admin por um instante antes de
 * trocar pra loja do usuário). Agora a consulta é uma só e quem monta depois
 * já recebe o usuário pronto.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const ultimaLeituraRef = useRef(0)

  useEffect(() => {
    let montado = true
    // Id da sessão cuja linha em `usuarios` já foi (ou está sendo) carregada —
    // evita refazer a consulta quando o Supabase reemite SIGNED_IN só porque a
    // aba voltou a ter foco.
    let usuarioIdCarregado: string | null = null

    const carregarUsuario = async (userId: string) => {
      const { data: userData, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', userId)
        .single()

      if (!montado) return
      ultimaLeituraRef.current = Date.now()
      if (error) {
        setErro(error.message)
      } else {
        setErro(null)
        setUsuario(userData)
      }
      setCarregando(false)
    }

    const init = async () => {
      try {
        // Pegar sessão do Supabase
        const { data } = await supabase.auth.getSession()

        if (!montado) return

        if (!data.session) {
          // Modo teste: injetar usuário fake se em development (e não foi desconectado)
          if (process.env.NODE_ENV === 'development' && !localStorage.getItem('logged_out')) {
            const testUser = {
              id: 'b3bdcd1b-440c-4a2d-9305-9254f890473e',
              email: 'teste@algodoce.local',
              nome: 'Usuário Teste',
              role: 'admin',
              ativo: true,
            }
            if (montado) {
              setUsuario(testUser)
              console.log('✅ Modo teste: usuário injetado')
            }
          }
          setCarregando(false)
          return
        }

        setUser(data.session.user)

        // Buscar usuário na base
        usuarioIdCarregado = data.session.user.id
        await carregarUsuario(data.session.user.id)

      } catch (e: any) {
        if (montado) {
          setCarregando(false)
        }
      }
    }

    init()

    // Listener de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (montado) {
        if (session) {
          setUser(session.user)
          // Login feito depois que o provider montou (ex.: na tela de login):
          // sem isto `usuario` ficaria nulo até recarregar a página.
          if (event === 'SIGNED_IN' && usuarioIdCarregado !== session.user.id) {
            usuarioIdCarregado = session.user.id
            // fora do callback síncrono do auth, como recomenda o supabase-js
            setTimeout(() => { carregarUsuario(session.user.id) }, 0)
          }
        } else {
          usuarioIdCarregado = null
          setUser(null)
          setUsuario(null)
        }
      }
    })

    // Aba que ficou muito tempo em segundo plano: relê a linha do usuário,
    // porque o estado agora é compartilhado e não é refeito a cada página.
    const aoVoltarParaAba = () => {
      if (document.visibilityState !== 'visible' || !usuarioIdCarregado) return
      if (Date.now() - ultimaLeituraRef.current < RELER_USUARIO_APOS_MS) return
      carregarUsuario(usuarioIdCarregado)
    }
    document.addEventListener('visibilitychange', aoVoltarParaAba)

    return () => {
      montado = false
      subscription?.unsubscribe()
      document.removeEventListener('visibilitychange', aoVoltarParaAba)
    }
  }, [])

  const logout = useCallback(async () => {
    localStorage.setItem('logged_out', 'true')
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ user, usuario, carregando, erro, logout }),
    [user, usuario, carregando, erro, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth() precisa estar dentro do <AuthProvider> (app/layout.tsx)')
  }
  return ctx
}
