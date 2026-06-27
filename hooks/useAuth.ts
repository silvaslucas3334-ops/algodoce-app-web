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

    const init = async () => {
      try {
        // Pegar sessão do Supabase
        const { data } = await supabase.auth.getSession()

        if (!montado) return

        if (!data.session) {
          setCarregando(false)
          return
        }

        setUser(data.session.user)

        // Buscar usuário na base
        const { data: userData, error } = await supabase
          .from('usuarios')
          .select('*')
          .eq('id', data.session.user.id)
          .single()

        if (montado) {
          if (error) {
            setErro(error.message)
          } else {
            setUsuario(userData)
          }
          setCarregando(false)
        }
      } catch (e: any) {
        if (montado) {
          setErro(e.message)
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
        } else {
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
    await supabase.auth.signOut()
  }

  return { user, usuario, carregando, erro, logout }
}
