import { useEffect } from 'react'

/** Chama `onEscape` quando o usuário aperta Esc — padrão de acessibilidade para modais. */
export function useEscapeKey(onEscape: () => void, ativo = true) {
  useEffect(() => {
    if (!ativo) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onEscape, ativo])
}
