'use client'
import Link from 'next/link'
import { CalendarClock, CalendarDays, CheckCircle2, Wallet } from 'lucide-react'
import { formatBRL } from '@/lib/ofx'
import { linksPainelFinanceiro, PainelFinanceiro, TotalPainel } from '@/lib/financeiro-painel'

interface Props {
  painel: PainelFinanceiro
  /** Saldo acumulado de hoje no Fluxo de Caixa. null = saldo inicial do mês não informado (tile não aparece). */
  saldoProjetado: number | null
}

function legenda(t: TotalPainel, singular: string, plural: string, vazio: string) {
  if (t.qtd === 0) return vazio
  return `${t.qtd} ${t.qtd === 1 ? singular : plural}`
}

/**
 * Bloco "Contas a pagar" do Início do admin: o que vence hoje, nos próximos 7 dias e o que já
 * está aprovado para pagar. Cada tile abre a lista de Despesas já filtrada com os mesmos critérios.
 * As atrasadas ficam em "Atenção Necessária" (não repetem aqui).
 */
export default function ContasAPagarAdmin({ painel, saldoProjetado }: Props) {
  const links = linksPainelFinanceiro()
  const tiles: {
    chave: string
    href: string
    icone: React.ReactNode
    rotulo: string
    valor: string
    detalhe: string
    destaque?: boolean
  }[] = [
    {
      chave: 'hoje',
      href: links.hoje,
      icone: <CalendarClock size={20} className="text-orange-600" />,
      rotulo: 'Vence hoje',
      valor: formatBRL(painel.hoje.valor),
      detalhe: legenda(painel.hoje, 'despesa', 'despesas', 'nada vence hoje'),
    },
    {
      chave: 'prox7',
      href: links.proximos7,
      icone: <CalendarDays size={20} className="text-blue-600" />,
      rotulo: 'Próximos 7 dias',
      valor: formatBRL(painel.proximos7.valor),
      detalhe: legenda(painel.proximos7, 'despesa', 'despesas', 'nada nos próximos dias'),
    },
    {
      chave: 'aprovadas',
      href: links.aprovadas,
      icone: <CheckCircle2 size={20} className="text-green-600" />,
      rotulo: 'Aprovadas p/ pagar',
      valor: formatBRL(painel.aprovadas.valor),
      detalhe: legenda(painel.aprovadas, 'pronta para pagar', 'prontas para pagar', 'nenhuma aprovada'),
      destaque: painel.aprovadas.qtd > 0,
    },
  ]

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Contas a pagar</h2>
        <Link href="/financeiro/despesas" className="text-xs font-semibold text-pink-700 hover:underline">
          Ver despesas →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link
            key={t.chave}
            href={t.href}
            className={`rounded-lg p-4 border hover:shadow-md transition-all ${
              t.destaque ? 'bg-green-50 border-green-200 hover:border-green-300' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              {t.icone}
              <span className="text-xs text-gray-500 text-right">{t.rotulo}</span>
            </div>
            <p className="text-xl font-bold text-gray-800">{t.valor}</p>
            <p className="text-xs text-gray-600 mt-1">{t.detalhe}</p>
          </Link>
        ))}
        {saldoProjetado !== null && (
          <Link
            href="/financeiro/fluxo-caixa"
            className="bg-white border border-gray-200 hover:border-gray-300 rounded-lg p-4 hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-2">
              <Wallet size={20} className={saldoProjetado < 0 ? 'text-red-600' : 'text-emerald-600'} />
              <span className="text-xs text-gray-500 text-right">Saldo projetado hoje</span>
            </div>
            <p className={`text-xl font-bold ${saldoProjetado < 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatBRL(saldoProjetado)}</p>
            <p className="text-xs text-gray-600 mt-1">pelo Fluxo de Caixa (não é saldo do banco)</p>
          </Link>
        )}
      </div>
    </div>
  )
}
