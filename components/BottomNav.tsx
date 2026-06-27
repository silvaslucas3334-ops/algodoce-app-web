'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, ChefHat, ScanLine, Package, User } from 'lucide-react'

const links = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/ordens', label: 'Ordens', icon: ClipboardList },
  { href: '/producao', label: 'Produção', icon: ChefHat },
  { href: '/scanner', label: 'Scanner', icon: ScanLine },
  { href: '/estoque', label: 'Estoque', icon: Package },
  { href: '/perfil', label: 'Perfil', icon: User },
]

export default function BottomNav() {
  const path = usePathname()
  if (path === '/login' || path === '/signup') return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto flex justify-around">
        {links.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link key={href} href={href} className={`flex flex-col items-center py-2 px-3 text-xs ${active ? 'text-pink-700' : 'text-gray-500'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className="mt-0.5">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
