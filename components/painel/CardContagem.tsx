import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

interface CardContagemProps {
  valor: number
  Icone: LucideIcon
  cor: string
  legenda: string
  href: string
}

// Card só de contagem (sem lista pra expandir) — clique leva direto pro
// módulo relacionado, mesmo padrão visual da antiga grade "Situação Geral".
export default function CardContagem({ valor, Icone, cor, legenda, href }: CardContagemProps) {
  return (
    <Link href={href} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 transition-all block">
      <Icone size={20} className={`${cor} mb-2`} />
      <p className="text-2xl font-bold text-gray-800">{valor}</p>
      <p className="text-xs text-gray-600 mt-1">{legenda}</p>
    </Link>
  )
}
