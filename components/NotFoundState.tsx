'use client'
import { useRouter } from 'next/navigation'
import { SearchX } from 'lucide-react'

interface Props {
  title?: string
  description?: string
  backHref: string
  backLabel?: string
}

// Estado de "registro não encontrado" em telas de detalhe — antes era um
// texto solto sem nenhuma saída além do menu inferior; agora sempre tem um
// botão de volta pra lista de onde o registro deveria estar.
export default function NotFoundState({ title = 'Não encontrado', description, backHref, backLabel = 'Voltar' }: Props) {
  const router = useRouter()
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <SearchX size={40} className="text-gray-300 mb-4" />
      <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-6 max-w-xs">{description}</p>}
      <button
        onClick={() => router.push(backHref)}
        className="px-6 py-2.5 bg-pink-700 text-white rounded-lg font-medium hover:bg-pink-800 transition-colors"
      >
        {backLabel}
      </button>
    </div>
  )
}
