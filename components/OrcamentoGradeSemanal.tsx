'use client'
import { formatBRL } from '@/lib/ofx'

interface Loja {
  id: 'loja1' | 'loja2'
  label: string
}

interface Props {
  lojas: Loja[]
  valores: Record<string, (number | null)[]> // por loja.id, index 0=domingo..6=sábado (Date.getDay())
  onChange: (lojaId: string, diaSemana: number, valor: number | null) => void
  readOnly?: boolean
  dias?: string[] // dias do mês sendo editado — habilita a linha "Total no mês" por loja
  rotuloTotal?: string
}

// Exibição seg→dom (o padrão que a equipe é cobrada em cima), mas o índice
// continua 0=domingo..6=sábado (Date.getDay()) — só a ordem de renderização
// muda, o dado guardado/enviado é sempre por esse índice.
const DIAS_EXIBICAO: { indice: number; label: string }[] = [
  { indice: 1, label: 'Segunda' },
  { indice: 2, label: 'Terça' },
  { indice: 3, label: 'Quarta' },
  { indice: 4, label: 'Quinta' },
  { indice: 5, label: 'Sexta' },
  { indice: 6, label: 'Sábado' },
  { indice: 0, label: 'Domingo' },
]

/**
 * Total do MÊS de uma loja a partir dos valores por dia da semana — cada
 * dia da semana entra tantas vezes quanto ocorre no mês (4 ou 5), que é
 * exatamente o que metaDiariaDeWeekdays/entradaPrevistaDeWeekdays fazem
 * depois no calendário. Sem isso o usuário só via a soma de "uma semana
 * típica" (7 células), que não é comparável com nenhum número do mês.
 */
function totalNoMes(valoresLoja: (number | null)[] | undefined, dias: string[]): number {
  if (!valoresLoja) return 0
  return dias.reduce((soma, dia) => soma + (valoresLoja[new Date(dia + 'T00:00:00').getDay()] ?? 0), 0)
}

export default function OrcamentoGradeSemanal({ lojas, valores, onChange, readOnly, dias, rotuloTotal = 'Total no mês' }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left font-semibold text-gray-600">Dia da semana</th>
            {lojas.map((loja) => (
              <th key={loja.id} className="px-3 py-2 text-right font-semibold text-gray-600">{loja.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {DIAS_EXIBICAO.map(({ indice, label }) => (
            <tr key={indice}>
              <td className="px-3 py-2 text-gray-700">{label}</td>
              {lojas.map((loja) => {
                const valor = valores[loja.id]?.[indice] ?? null
                return (
                  <td key={loja.id} className="px-3 py-1.5 text-right">
                    {readOnly ? (
                      <span className={valor != null ? 'text-gray-800' : 'text-gray-400'}>
                        {valor != null ? formatBRL(valor) : '—'}
                      </span>
                    ) : (
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        value={valor ?? ''}
                        onChange={(e) => onChange(loja.id, indice, e.target.value ? Number(e.target.value) : null)}
                        // Rolar a página com o cursor em cima de um input
                        // numérico altera o valor sem o usuário perceber —
                        // num campo de dinheiro isso é erro silencioso.
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0,00"
                        className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
                      />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {dias && dias.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td className="px-3 py-2 font-semibold text-gray-700">{rotuloTotal}</td>
              {lojas.map((loja) => (
                <td key={loja.id} className="px-3 py-2 text-right font-semibold text-gray-800">
                  {formatBRL(totalNoMes(valores[loja.id], dias))}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
