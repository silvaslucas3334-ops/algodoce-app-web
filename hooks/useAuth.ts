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
        // Sempre fazer logout ao carregar para forçar novo login
        await supabase.auth.signOut()

        if (!montado) return
        setCarregando(false)
        return

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
