'use client'
import { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronRight, CheckCircle2 } from 'lucide-react'
import { LOCAL_LABEL, ROMANEIO_STATUS_LABEL } from '@/lib/constants'
import { RomaneioEnriquecido, rotuloIdade, Unidade } from '@/lib/expedicao'

// Uma cor fixa por unidade, igual em todas as telas da Expedição — assim o admin
// (que vê as lojas misturadas) bate o olho e sabe de qual loja é cada romaneio.
const COR_UNIDADE: Record<Unidade, string> = {
  cozinha: 'bg-amber-100 text-amber-800',
  loja1: 'bg-sky-100 text-sky-800',
  loja2: 'bg-violet-100 text-violet-800',
}

export function ChipUnidade({ unidade }: { unidade: Unidade | null }) {
  if (!unidade) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Origem não registrada</span>
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${COR_UNIDADE[unidade]}`}>{LOCAL_LABEL[unidade]}</span>
}

const COR_STATUS: Record<string, string> = {
  rascunho: 'bg-amber-100 text-amber-700',
  confirmado: 'bg-green-100 text-green-700',
  em_estoque: 'bg-green-100 text-green-700',
  cancelado: 'bg-red-100 text-red-700',
}

interface Props {
  romaneio: RomaneioEnriquecido
  /** Se informado, o corpo do card vira link (ex.: abrir o romaneio). */
  href?: string
  /** Botão/ação à direita (ex.: "Receber"). Sem ação nem href, o card é só informativo. */
  acao?: ReactNode
  /** Mostra progresso de recebimento e idade (romaneios já enviados). */
  mostrarAndamento?: boolean
  /** Quando todas as etiquetas já foram recebidas mas o romaneio ficou aberto. */
  onConcluir?: () => void
  concluindo?: boolean
}

export default function RomaneioCard({ romaneio: r, href, acao, mostrarAndamento = false, onConcluir, concluindo }: Props) {
  const enviado = r.status === 'confirmado'
  const tudoRecebido = enviado && r.etiquetasTotal > 0 && r.etiquetasPendentes === 0
  const recebidos = r.produtosTotal - r.produtosPendentes
  const percentual = r.produtosTotal > 0 ? Math.round((recebidos / r.produtosTotal) * 100) : 0

  const corIdade =
    r.idadeDias == null ? '' : r.idadeDias >= 3 ? 'bg-red-100 text-red-700' : r.idadeDias >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'

  const corpo = (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <ChipUnidade unidade={r.origem} />
        <ArrowRight size={14} className="text-gray-400 flex-shrink-0" />
        <ChipUnidade unidade={r.unidade_destino} />
        <span className="text-xs text-gray-500 font-medium">{r.rotulo}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ml-auto ${COR_STATUS[r.status] || 'bg-gray-100 text-gray-600'}`}>
          {ROMANEIO_STATUS_LABEL[r.status] || r.status}
        </span>
      </div>

      <p className="text-base font-bold text-gray-800">
        Entrega: {new Date(r.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
      </p>
      <p className="text-sm text-gray-600">
        {r.produtosTotal} produto(s) · {r.etiquetasTotal} etiqueta(s) · Criado em {new Date(r.criado_em).toLocaleDateString('pt-BR')}
      </p>

      {mostrarAndamento && enviado && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2 text-xs mb-1">
            <span className={tudoRecebido ? 'text-green-700 font-semibold' : 'text-gray-600'}>
              {tudoRecebido ? 'Todas as etiquetas já foram recebidas' : `${recebidos} de ${r.produtosTotal} produtos recebidos`}
            </span>
            {r.idadeDias != null && !tudoRecebido && (
              <span className={`px-2 py-0.5 rounded-full font-semibold ${corIdade}`}>{rotuloIdade(r.idadeDias)}</span>
            )}
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${tudoRecebido ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${percentual}%` }} />
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md hover:border-gray-300 transition-all">
      <div className="flex items-start gap-3">
        {href ? (
          <Link href={href} className="flex-1 min-w-0 flex items-start gap-3 cursor-pointer">
            {corpo}
            <ChevronRight size={22} className="text-gray-400 flex-shrink-0 mt-1" />
          </Link>
        ) : (
          corpo
        )}
        {acao && <div className="flex-shrink-0">{acao}</div>}
      </div>

      {tudoRecebido && onConcluir && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Nada mais está a caminho — este romaneio só ficou aberto. Concluir tira ele de &quot;pendente&quot;.
          </p>
          <button
            onClick={onConcluir}
            disabled={concluindo}
            className="flex-shrink-0 flex items-center gap-1.5 bg-green-600 text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 size={14} /> {concluindo ? 'Concluindo...' : 'Concluir'}
          </button>
        </div>
      )}
    </div>
  )
}
