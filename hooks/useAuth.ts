import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [usuario, setUsuario] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

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
      if (error) {
        setErro(error.message)
      } else {
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
          // Login feito depois que este hook montou (ex.: o portão global do
          // layout já estava montado na tela de login): sem isto `usuario`
          // ficaria nulo até recarregar a página.
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

    return () => {
      montado = false
      subscription?.unsubscribe()
    }
  }, [])

  const logout = async () => {
    localStorage.setItem('logged_out', 'true')
    await supabase.auth.signOut()
  }

  return { user, usuario, carregando, erro, logout }
}
