'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ClipboardList, ChefHat, ScanLine, Package, User, CheckSquare, Truck } from 'lucide-react'
import OluquinhasLogo from './OluquinhasLogo'

const links = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/ordens', label: 'Ordens', icon: ClipboardList },
  { href: '/producao', label: 'Produção', icon: ChefHat },
  { href: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { href: '/scanner', label: 'Scanner', icon: ScanLine },
  { href: '/estoque', label: 'Estoque', icon: Package },
  { href: '/expedicao', label: 'Expedição', icon: Truck },
  { href: '/perfil', label: 'Perfil', icon: User },
]

export default function BottomNav() {
  const path = usePathname()
  if (path === '/login' || path === '/signup') return null
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-5xl mx-auto flex items-center">
        {/* Logo Oluquinhas - Fixed Left */}
        <div className="flex-shrink-0 p-2">
          <OluquinhasLogo size="xs" variant="rosto" color="marrom" />
        </div>

        {/* Links com scroll horizontal */}
        <div className="flex-1 overflow-x-auto scrollbar-hide scroll-smooth">
          <div className="flex gap-1 px-2 h-full items-center">
            {links.map(({ href, label, icon: Icon }) => {
              const active = path === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex flex-col items-center justify-center py-2 px-3 text-xs font-medium whitespace-nowrap rounded-lg transition-all flex-shrink-0 ${
                    active
                      ? 'bg-pink-100 text-pink-700 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="mt-0.5">{label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Logo AlgoDoce - Fixed Right */}
        <div className="flex-shrink-0 p-2 w-8 h-8 relative">
          <Image src="/logo.png" alt="AlgoDoce" fill className="object-contain" />
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </nav>
  )
}
