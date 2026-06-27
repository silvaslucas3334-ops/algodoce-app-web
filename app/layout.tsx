import type { Metadata } from 'next'
import BottomNav from '@/components/BottomNav'
import './globals.css'

export const metadata: Metadata = {
  title: 'AlgoDoce - Gestão de Produção',
  description: 'Sistema de gestão de produção e estoque para AlgoDoce',
  openGraph: {
    title: 'AlgoDoce - Gestão de Produção',
    description: 'Sistema de gestão de produção e estoque para AlgoDoce',
    url: 'https://algodoce-aovmiy52kq-algodoce.vercel.app',
    siteName: 'AlgoDoce',
    images: [
      {
        url: 'https://algodoce-aovmiy52kq-algodoce.vercel.app/logo.png',
        width: 200,
        height: 200,
        alt: 'AlgoDoce Logo',
      },
    ],
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content="#c2185b" />
      </head>
      <body className="bg-gray-50">
        <div className="pb-20">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  )
}
