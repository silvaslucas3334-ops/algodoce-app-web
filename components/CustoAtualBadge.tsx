import { CustoAtualMateriaPrima } from '@/lib/financeiro-cmv'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function labelMesReferencia(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.slice(0, 7).split('-').map(Number)
  return `${MESES_ABREV[mes - 1]}/${ano}`
}

interface Props {
  custo: Pick<CustoAtualMateriaPrima, 'origem' | 'mesReferencia' | 'desatualizado' | 'temComprasRegistradas'>
}

/** Selos de proveniência do custo — usados em toda tela que resolve um custo de matéria-prima. */
export default function CustoAtualBadges({ custo }: Props) {
  return (
    <span className="inline-flex items-center gap-1">
      {custo.origem === 'manual' && (
        <span
          className="text-[10px] font-semibold text-blue-700 bg-blue-100 rounded-full px-1.5 py-0.5 whitespace-nowrap"
          title={
            custo.temComprasRegistradas
              ? 'Custo manual — já existem compras registradas, considere usar o cálculo automático'
              : 'Custo manual — definido à mão, sem compras registradas'
          }
        >
          Custo manual
        </span>
      )}
      {custo.origem === 'calculado' && custo.desatualizado && (
        <span
          className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 whitespace-nowrap"
          title={custo.mesReferencia ? `Preço de ${labelMesReferencia(custo.mesReferencia)} — sem compra mais recente registrada` : 'Custo desatualizado'}
        >
          Custo desatualizado
        </span>
      )}
    </span>
  )
}
