'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const TEMPO_INATIVIDADE_MS = 15 * 60 * 1000 // 15 minutos sem interação

const EVENTOS_ATIVIDADE = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'] as const

// Desloga automaticamente depois de um período sem interação — protege
// um dispositivo compartilhado (tablet/computador da loja) esquecido
// logado. Roda em todas as páginas (montado no layout raiz), mas só
// arma o timer quando há usuário logado.
export default function IdleLogout() {
  const { usuario, logout } = useAuth()
  const router = useRouter()
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!usuario) return

    function resetarTimer() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(async () => {
        await logout()
        router.push('/login')
      }, TEMPO_INATIVIDADE_MS)
    }

    EVENTOS_ATIVIDADE.forEach((evento) => window.addEventListener(evento, resetarTimer))
    resetarTimer()

    return () => {
      EVENTOS_ATIVIDADE.forEach((evento) => window.removeEventListener(evento, resetarTimer))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [usuario, logout, router])

  return null
}
