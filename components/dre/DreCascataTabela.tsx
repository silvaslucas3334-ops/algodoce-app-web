'use client'
import { Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  BasePercentual,
  ContaCascata,
  LinhaCascata,
  percentualSobre,
  TomVariacao,
  variacaoDaConta,
  variacaoDaLinha,
} from '@/lib/financeiro-dre-apresentacao'
import { formatBRL } from '@/lib/ofx'

const COR_TOM: Record<TomVariacao, string> = {
  bom: 'text-green-700',
  ruim: 'text-red-600',
  neutro: 'text-gray-400',
  nenhum: 'text-gray-300',
}

// Contas de encargo de venda que devem ter valor todo mês com receita: zeradas = ainda não lançadas.
const CONTAS_ENCARGO_VENDA = new Set(['2003', '2004', '2005'])

interface Props {
  linhas: LinhaCascata[]
  /** 100% da coluna de percentual: receita bruta ou líquida, conforme a base escolhida */
  baseValor: number
  base: BasePercentual
  /** só nas visões de uma loja: fatia do rateio da cozinha (0 a 1); null em Consolidado */
  percentualRateio: number | null
  onMudarBase: (base: BasePercentual) => void
  receitaBruta: number
  /** rótulo curto do mês anterior para o cabeçalho ("set"); null quando ainda não há comparação */
  rotuloAnterior: string
  carregandoAnterior: boolean
  parcial: boolean
  expandidos: Set<string>
  onAlternar: (id: string) => void
  onAlternarTodos: () => void
  todosAbertos: boolean
  onAbrirConta: (linha: LinhaCascata, conta: ContaCascata) => void
}

function Barra({ valor, base, cor }: { valor: number; base: number; cor: string }) {
  const largura = base > 0 ? Math.min(100, (Math.abs(valor) / base) * 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${largura}%` }} />
    </div>
  )
}

export default function DreCascataTabela({
  linhas,
  baseValor,
  base,
  percentualRateio,
  onMudarBase,
  receitaBruta,
  rotuloAnterior,
  carregandoAnterior,
  parcial,
  expandidos,
  onAlternar,
  onAlternarTodos,
  todosAbertos,
  onAbrirConta,
}: Props) {
  const colunaVariacao = parcial ? 'Variação' : `vs ${rotuloAnterior}`

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-700">Cascata do mês</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>% sobre</span>
            <div className="flex rounded-md border border-gray-200 overflow-hidden" role="group" aria-label="Base dos percentuais">
              {(['bruta', 'liquida'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => onMudarBase(b)}
                  aria-pressed={base === b}
                  className={`px-2.5 py-1 font-medium ${base === b ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {b === 'bruta' ? 'Receita bruta' : 'Receita líquida'}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onAlternarTodos} className="text-xs font-semibold text-pink-700 hover:underline whitespace-nowrap">
            {todosAbertos ? 'Recolher contas' : 'Expandir contas'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th scope="col" className="text-left font-medium px-4 py-2">Linha</th>
              <th scope="col" className="text-right font-medium px-3 py-2">Valor</th>
              <th
                scope="col"
                className="text-right font-medium px-3 py-2 whitespace-nowrap"
                title={`Percentual sobre a receita ${base === 'bruta' ? 'bruta' : 'líquida'} (= 100%)`}
              >
                {base === 'bruta' ? '% rec. bruta' : '% rec. líq.'}
              </th>
              <th scope="col" className="hidden lg:table-cell font-medium px-3 py-2 w-28" title="Proporção sobre a receita bruta">
                Proporção
              </th>
              <th scope="col" className="text-right font-medium px-4 py-2 whitespace-nowrap">{colunaVariacao}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const aberto = expandidos.has(l.id)
              const temContas = l.tipo === 'grupo' && l.contas.length > 0
              const pct = percentualSobre(l.valor, baseValor)
              const v = variacaoDaLinha(l)
              const destaque = l.tipo === 'subtotal' || l.tipo === 'resultado'
              const final = l.id === 'resultado'
              const corValor = final ? (l.valor >= 0 ? 'text-green-700' : 'text-red-700') : l.valor < 0 ? 'text-red-600' : 'text-gray-800'
              const corBarra =
                l.tipo === 'receita' ? 'bg-blue-500' : l.tipo === 'grupo' ? 'bg-rose-400' : l.valor >= 0 ? 'bg-emerald-500' : 'bg-red-500'
              return (
                <Fragment key={l.id}>
                  <tr className={`border-b border-gray-50 ${destaque ? 'bg-pink-50/60' : ''} ${final ? 'border-t border-pink-200' : ''}`}>
                    <td className={`px-4 py-2.5 ${destaque ? 'font-bold text-pink-900' : 'text-gray-700 font-medium'} ${l.alerta ? 'text-red-700' : ''}`}>
                      {temContas ? (
                        <button
                          onClick={() => onAlternar(l.id)}
                          aria-expanded={aberto}
                          className="flex items-center gap-1.5 text-left hover:text-pink-700"
                        >
                          {aberto ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
                          {l.rotulo}
                          <span className="text-xs font-normal text-gray-400">({l.contas.length})</span>
                        </button>
                      ) : (
                        l.rotulo
                      )}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${destaque ? 'font-bold' : 'font-semibold'} ${corValor}`}>
                      {formatBRL(l.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">
                      {pct == null ? '—' : `${pct.toFixed(1).replace('.', ',')}%`}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2.5">
                      <Barra valor={l.valor} base={receitaBruta} cor={corBarra} />
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums whitespace-nowrap text-xs ${carregandoAnterior ? 'text-gray-300' : COR_TOM[v.tom]}`}>
                      {parcial ? '—' : carregandoAnterior ? '…' : v.texto}
                    </td>
                  </tr>
                  {temContas &&
                    aberto &&
                    l.contas.map((c) => {
                      const cv = variacaoDaConta(c)
                      const clicavel = c.valor !== 0
                      const naoLancado = c.valor === 0 && CONTAS_ENCARGO_VENDA.has(c.codigo) && receitaBruta > 0
                      const cpct = percentualSobre(c.valor, baseValor)
                      return (
                        <tr key={c.contaId} className="border-b border-gray-50 bg-gray-50/40 text-gray-600">
                          <td className="pl-10 pr-4 py-2">
                            {clicavel ? (
                              <button onClick={() => onAbrirConta(l, c)} className="text-left hover:text-pink-700 hover:underline">
                                {c.codigo !== '—' ? `${c.codigo} — ${c.nome}` : c.nome}
                              </button>
                            ) : (
                              <span className="text-gray-500">{c.codigo !== '—' ? `${c.codigo} — ${c.nome}` : c.nome}</span>
                            )}
                            {naoLancado && (
                              <span className="ml-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                não lançado
                              </span>
                            )}
                            {c.nota && <span className="block text-xs text-amber-600 mt-0.5">{c.nota}</span>}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${c.valor === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                            {formatBRL(c.valor)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs text-gray-400 whitespace-nowrap">
                            {cpct == null || c.valor === 0 ? '' : `${cpct.toFixed(1).replace('.', ',')}%`}
                          </td>
                          <td className="hidden lg:table-cell" />
                          <td className={`px-4 py-2 text-right tabular-nums whitespace-nowrap text-xs ${carregandoAnterior ? 'text-gray-300' : COR_TOM[cv.tom]}`}>
                            {parcial || c.valor === 0 ? '' : carregandoAnterior ? '…' : cv.texto}
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 px-4 py-3 border-t border-gray-100">
        Receita bruta = faturamento informado (lançamento diário e, nos dias sem lançamento, o PDV importado) — não é o que caiu no banco.
        Percentuais sobre a receita {base === 'bruta' ? 'bruta' : 'líquida'} (= 100%). CMV = compras de insumos do mês, não o consumo real. Clique numa conta para ver os lançamentos.
        {percentualRateio != null && (
          <>
            {' '}
            <span className="text-gray-500 font-medium">
              Rateio: esta loja fica com {(percentualRateio * 100).toFixed(1).replace('.', ',')}% do faturamento das duas — vale para as contas
              centrais (Plano de Contas) e tudo lançado em Rateio (Cozinha).
            </span>
          </>
        )}
      </p>
    </div>
  )
}
