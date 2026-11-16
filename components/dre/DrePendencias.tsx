'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle, Loader } from 'lucide-react'
import type { QualidadeDre } from '@/lib/financeiro-dre-qualidade'

// "Este mês está completo?" — painel compacto ao lado da cascata. Cada pendência mostra só o título e o atalho
// para resolver; os detalhes aparecem sob demanda para o painel não empurrar o resto da tela.
export default function DrePendencias({ qualidade }: { qualidade: QualidadeDre | null }) {
  const [detalhes, setDetalhes] = useState(false)

  if (!qualidade) {
    return (
      <div id="dre-pendencias" className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
        <Loader size={14} className="animate-spin" /> Verificando os dados do mês…
      </div>
    )
  }

  if (qualidade.itens.length === 0) {
    return (
      <div id="dre-pendencias" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle size={16} className="flex-shrink-0" />
        Mês completo — nenhuma pendência conhecida nos dados.
      </div>
    )
  }

  const alertas = qualidade.itens.filter((i) => i.nivel === 'alerta').length
  const atencao = qualidade.itens.length - alertas

  return (
    <div id="dre-pendencias" className={`rounded-xl border overflow-hidden ${alertas > 0 ? 'border-red-200' : 'border-amber-200'}`}>
      <div className={`px-4 py-3 flex items-center justify-between gap-3 ${alertas > 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
        <p className={`text-sm font-semibold flex items-center gap-2 ${alertas > 0 ? 'text-red-800' : 'text-amber-800'}`}>
          <AlertTriangle size={16} className="flex-shrink-0" />
          Este mês está completo? {alertas > 0 ? 'Não' : 'Quase'}
          <span className="font-normal text-xs">
            · {alertas > 0 ? `${alertas} alerta(s)` : ''}
            {alertas > 0 && atencao > 0 ? ' e ' : ''}
            {atencao > 0 ? `${atencao} ponto(s) de atenção` : ''}
          </span>
        </p>
        <button onClick={() => setDetalhes((v) => !v)} aria-pressed={detalhes} className="text-xs font-semibold text-gray-600 hover:underline whitespace-nowrap">
          {detalhes ? 'Ocultar detalhes' : 'Mostrar detalhes'}
        </button>
      </div>
      <ul className="divide-y divide-gray-100 bg-white">
        {qualidade.itens.map((i) => (
          <li key={i.id} className="px-4 py-2.5 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium text-gray-800 flex items-start gap-2 min-w-0">
                <span
                  className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${i.nivel === 'alerta' ? 'bg-red-500' : 'bg-amber-500'}`}
                  aria-label={i.nivel === 'alerta' ? 'Alerta' : 'Atenção'}
                />
                <span>{i.titulo}</span>
              </p>
              {i.href && (
                <Link href={i.href} className="text-xs font-semibold text-pink-700 hover:underline whitespace-nowrap flex-shrink-0 pt-0.5">
                  {i.hrefRotulo || 'Abrir'} →
                </Link>
              )}
            </div>
            {detalhes && <p className="text-xs text-gray-500 mt-1 ml-4">{i.detalhe}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
