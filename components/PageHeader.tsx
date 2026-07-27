'use client'
import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

interface Props {
  title: ReactNode
  subtitle?: ReactNode
  backHref?: string
  onBack?: () => void
  actions?: ReactNode
  maxWidth?: string
}

// Cabeçalho compartilhado de todo o módulo Financeiro — substitui o padrão
// que antes era copiado à mão em cada página (ArrowLeft + router.push/back
// + h1), sem mudar o visual: mesmas classes, só um lugar só pra manter.
export default function PageHeader({ title, subtitle, backHref, onBack, actions, maxWidth = 'max-w-2xl' }: Props) {
  const router = useRouter()

  function handleBack() {
    if (onBack) onBack()
    else if (backHref) router.push(backHref)
    else router.back()
  }

  return (
    <div className="bg-white border-b border-gray-200">
      <div className={`${maxWidth} mx-auto px-4 py-4 flex items-center gap-3`}>
        <button onClick={handleBack} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-800 truncate">{title}</h1>
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
