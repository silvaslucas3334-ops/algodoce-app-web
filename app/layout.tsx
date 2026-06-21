import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AlgoDoce',
  description: 'Gestão de produção e estoque',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <main className="pb-20 max-w-lg mx-auto">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
