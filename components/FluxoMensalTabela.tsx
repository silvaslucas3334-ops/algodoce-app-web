'use client'
import { useState } from 'react'
import { FluxoMensalResultado, FluxoMensalLinhaGrupo } from '@/lib/financeiro-fluxo-mensal'
import { formatBRL } from '@/lib/ofx'
import { hojeISO } from '@/lib/financeiro-utils'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { LinhaDrilldown } from './FluxoMensalDrilldownModal'

interface Props {
  dados: FluxoMensalResultado
  onAbrirDrilldown: (titulo: string, linhas: LinhaDrilldown[]) => void
}

const DIA_SEMANA_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatCompacto(valor: number | null): string {
  if (valor == null) return '—'
  return Math.round(valor).toLocaleString('pt-BR')
}

function corTexto(cor: 'azul' | 'laranja' | 'verde'): string {
  if (cor === 'verde') return 'text-green-600'
  if (cor === 'laranja') return 'text-amber-600'
  return 'text-blue-600'
}

// Marca a coluna de hoje com uma borda — divisor visual entre o que já
// aconteceu (esquerda, incl. hoje) e o que é previsão (direita).
function bordaHoje(dia: string, hoje: string): string {
  return dia === hoje ? 'border-r-[3px] border-r-pink-500' : ''
}

function CelulaDia({
  valor,
  ehForecast,
  className,
}: {
  valor: number | null
  ehForecast?: boolean
  className?: string
}) {
  return (
    <td className={`px-2 py-1.5 text-right whitespace-nowrap ${ehForecast ? 'text-gray-400 italic' : 'text-gray-700'} ${className || ''}`}>
      {formatCompacto(valor)}
    </td>
  )
}

function linhaParaDrilldown(linha: FluxoMensalLinhaGrupo, dias: string[]): LinhaDrilldown[] {
  return dias.map((d, i) => ({ label: new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'), valor: linha.porDia[i] }))
}

export default function FluxoMensalTabela({ dados, onAbrirDrilldown }: Props) {
  const [expandidoSaidas, setExpandidoSaidas] = useState(false)
  const hoje = hojeISO()

  const orcadoPorId = new Map(dados.orcadoXRealizado.map((o) => [o.id, o]))

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
      <div className="flex items-center gap-4 px-3 py-2 text-[11px] text-gray-500 border-b border-gray-100 whitespace-nowrap">
        <span>Texto normal = realizado</span>
        <span className="italic text-gray-400">Itálico = previsão</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 border-t-[3px] border-pink-500" /> Hoje
        </span>
      </div>
      <table className="text-xs min-w-max">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="sticky left-0 bg-white px-3 py-2 text-left font-semibold text-gray-600 min-w-[160px]">Linha</th>
            {dados.dias.map((d) => {
              const dia = new Date(d + 'T00:00:00')
              return (
                <th
                  key={d}
                  className={`px-2 py-2 text-right font-medium min-w-[52px] ${d === hoje ? 'bg-pink-50 text-pink-700' : 'text-gray-500'} ${bordaHoje(d, hoje)}`}
                >
                  <div>{DIA_SEMANA_LABEL[dia.getDay()]}</div>
                  <div>{dia.getDate()}</div>
                </th>
              )
            })}
            <th className="px-3 py-2 text-right font-semibold text-gray-600 min-w-[80px]">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {dados.faturamentoAplicavel && (
            <>
              <tr className="bg-blue-50/50">
                <td className="sticky left-0 bg-blue-50 px-3 py-1.5 font-semibold text-gray-700">Faturamento</td>
                {dados.faturamentoPorDia.map((v, i) => (
                  <CelulaDia key={i} valor={v} ehForecast={dados.faturamentoEhForecastPorDia[i]} className={bordaHoje(dados.dias[i], hoje)} />
                ))}
                <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                  {formatBRL(dados.faturamentoPorDia.reduce((s: number, v) => s + (v || 0), 0))}
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-white px-3 py-1.5 text-gray-500">Meta Diária</td>
                {dados.metaDiariaPorDia.map((v, i) => <CelulaDia key={i} valor={v} className={bordaHoje(dados.dias[i], hoje)} />)}
                <td className="px-3 py-1.5 text-right text-gray-600">{dados.metaMensal != null ? formatBRL(dados.metaMensal) : '—'}</td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-white px-3 py-1.5 text-gray-500">Delta</td>
                {dados.deltaPorDia.map((v, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 text-right whitespace-nowrap ${v == null ? 'text-gray-400' : v >= 0 ? 'text-green-600' : 'text-amber-600'} ${bordaHoje(dados.dias[i], hoje)}`}
                  >
                    {formatCompacto(v)}
                  </td>
                ))}
                <td className="px-3 py-1.5" />
              </tr>
              <tr className="border-b-2 border-gray-200">
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-gray-600">GAP Acumulado</td>
                {dados.gapAcumuladoPorDia.map((v, i) => (
                  <td
                    key={i}
                    className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${v == null ? 'text-gray-400' : v >= 0 ? 'text-green-600' : 'text-amber-600'} ${bordaHoje(dados.dias[i], hoje)}`}
                  >
                    {formatCompacto(v)}
                  </td>
                ))}
                <td className="px-3 py-1.5" />
              </tr>
            </>
          )}

          <tr className="bg-green-50/50">
            <td className="sticky left-0 bg-green-50 px-3 py-1.5 font-semibold text-gray-700">Entradas de Caixa</td>
            {dados.entradasCaixaPorDia.map((v, i) => (
              <CelulaDia key={i} valor={v} ehForecast={dados.entradasCaixaEhForecastPorDia[i]} className={bordaHoje(dados.dias[i], hoje)} />
            ))}
            <td className="px-3 py-1.5 text-right font-semibold text-gray-800">{formatBRL(dados.totalEntradasCaixa)}</td>
          </tr>
          {dados.entradasCaixaPorCategoria.map((c) => (
            <tr key={c.categoria}>
              <td className="sticky left-0 bg-white px-3 py-1 pl-6 text-gray-500">{c.label}</td>
              <td colSpan={dados.dias.length} className="sticky left-[160px] bg-white px-2 py-1 text-left text-gray-400 italic whitespace-nowrap">
                só mês inteiro — {formatBRL(c.total)}
              </td>
              <td className="px-3 py-1 text-right text-gray-600">{formatBRL(c.total)}</td>
            </tr>
          ))}

          <tr className="border-t-2 border-gray-200">
            <td className="sticky left-0 bg-white px-3 py-1.5">
              <button onClick={() => setExpandidoSaidas((v) => !v)} className="flex items-center gap-1 font-semibold text-gray-700 hover:text-pink-700">
                {expandidoSaidas ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Saídas
              </button>
            </td>
            {dados.saidasPorDia.map((v, i) => (
              <CelulaDia key={i} valor={-v} className={`${v > 0 ? 'text-red-600' : ''} ${bordaHoje(dados.dias[i], hoje)}`} />
            ))}
            <td className="px-3 py-1.5 text-right font-semibold text-red-600">{formatBRL(dados.totalSaidas)}</td>
          </tr>
          {expandidoSaidas &&
            dados.saidasPorGrupo.map((linha) => {
              const orcado = orcadoPorId.get(linha.id)
              return (
                <tr
                  key={linha.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => onAbrirDrilldown(linha.nome, linhaParaDrilldown(linha, dados.dias))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onAbrirDrilldown(linha.nome, linhaParaDrilldown(linha, dados.dias))
                    }
                  }}
                >
                  <td className="sticky left-0 bg-white px-3 py-1 pl-6 text-gray-500">{linha.nome}</td>
                  {linha.porDia.map((v, i) => <CelulaDia key={i} valor={v > 0 ? -v : 0} className={bordaHoje(dados.dias[i], hoje)} />)}
                  <td className={`px-3 py-1 text-right ${orcado ? corTexto(orcado.cor) : 'text-gray-600'}`}>
                    {formatBRL(linha.total)}
                    {orcado && <span className="block text-[10px]">orçado {formatBRL(orcado.previsto)}</span>}
                  </td>
                </tr>
              )
            })}

          <tr className="border-t-2 border-gray-300 bg-gray-50">
            <td className="sticky left-0 bg-gray-50 px-3 py-1.5 font-semibold text-gray-700">Saldo do dia</td>
            {dados.saldoDiaPorDia.map((v, i) => (
              <td
                key={i}
                className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${v >= 0 ? 'text-green-600' : 'text-red-600'} ${bordaHoje(dados.dias[i], hoje)}`}
              >
                {formatCompacto(v)}
              </td>
            ))}
            <td className="px-3 py-1.5" />
          </tr>
          <tr className="bg-gray-50">
            <td className="sticky left-0 bg-gray-50 px-3 py-1.5 font-semibold text-gray-700">
              Saldo Acumulado{dados.saldoInicial == null && <span className="block text-[10px] font-normal text-amber-600">sem saldo inicial</span>}
            </td>
            {dados.saldoAcumuladoPorDia.map((v, i) => (
              <td
                key={i}
                className={`px-2 py-1.5 text-right whitespace-nowrap font-medium ${v >= 0 ? 'text-green-600' : 'text-red-600'} ${bordaHoje(dados.dias[i], hoje)}`}
              >
                {formatCompacto(v)}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right font-bold text-gray-800">
              {formatBRL(dados.saldoAcumuladoPorDia[dados.saldoAcumuladoPorDia.length - 1] || 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
