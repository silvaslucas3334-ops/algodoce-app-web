'use client'
import { useEffect, useState } from 'react'
import {
  buscarFaturamentoDiario,
  salvarFaturamentoDiario,
  CATEGORIAS_FATURAMENTO_DIARIO,
} from '@/lib/financeiro-faturamento-diario'
import { hojeISO } from '@/lib/financeiro-utils'
import { UNIDADE_LABEL, CATEGORIA_RECEITA_LABEL } from '@/lib/constants'
import { CategoriaFaturamentoDiario } from '@/lib/types'
import { X, Save } from 'lucide-react'

interface Props {
  unidadeInicial: 'loja1' | 'loja2'
  usuarioId: string
  onClose: () => void
  onSalvo: () => void
}

const CAMPOS_VAZIOS: Record<CategoriaFaturamentoDiario, string> = {
  dinheiro: '',
  venda_cartao: '',
  pix: '',
  repasse_ifood: '',
  repasse_aiqfome: '',
}

// Faturamento informado pelo lojista (fechamento do dia), quebrado por forma
// de pagamento — alimenta só a linha "Faturamento"/Meta de Venda do Fluxo de
// Caixa, nunca uma Entrada de Caixa (essa continua vindo só do extrato ou do
// botão "Dinheiro" já existente).
export default function InformarFaturamentoDiarioModal({ unidadeInicial, usuarioId, onClose, onSalvo }: Props) {
  const [unidade, setUnidade] = useState<'loja1' | 'loja2'>(unidadeInicial)
  const [data, setData] = useState(hojeISO())
  const [campos, setCampos] = useState<Record<CategoriaFaturamentoDiario, string>>(CAMPOS_VAZIOS)
  const [carregando, setCarregando] = useState(true)
  const [jaLancado, setJaLancado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      try {
        const existente = await buscarFaturamentoDiario(unidade, data)
        if (cancelado) return
        if (existente) {
          setCampos({
            dinheiro: String(existente.dinheiro),
            venda_cartao: String(existente.venda_cartao),
            pix: String(existente.pix),
            repasse_ifood: String(existente.repasse_ifood),
            repasse_aiqfome: String(existente.repasse_aiqfome),
          })
          setJaLancado(true)
        } else {
          setCampos(CAMPOS_VAZIOS)
          setJaLancado(false)
        }
      } catch (err: any) {
        if (!cancelado) setErro('Erro ao carregar: ' + (err?.message || 'desconhecido'))
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }
    carregar()
    return () => { cancelado = true }
  }, [unidade, data])

  const valores = CATEGORIAS_FATURAMENTO_DIARIO.reduce((acc, categoria) => {
    acc[categoria] = Number(campos[categoria].replace(',', '.')) || 0
    return acc
  }, {} as Record<CategoriaFaturamentoDiario, number>)

  const total = CATEGORIAS_FATURAMENTO_DIARIO.reduce((soma, categoria) => soma + valores[categoria], 0)

  async function salvar() {
    setSalvando(true)
    setErro('')
    try {
      await salvarFaturamentoDiario(unidade, data, valores, usuarioId)
      onSalvo()
      onClose()
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Faturamento do Dia</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Loja</label>
            <div className="flex gap-2">
              {(['loja1', 'loja2'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidade(u)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${
                    unidade === u ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  {UNIDADE_LABEL[u]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {jaLancado && !carregando && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Esse dia já tem faturamento lançado — os valores abaixo são os existentes. Salvar substitui.
            </p>
          )}

          {carregando ? (
            <p className="text-sm text-gray-400 text-center py-2">Carregando...</p>
          ) : (
            <div className="space-y-3">
              {CATEGORIAS_FATURAMENTO_DIARIO.map((categoria) => (
                <div key={categoria}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {CATEGORIA_RECEITA_LABEL[categoria]}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={campos[categoria]}
                    onChange={(e) => setCampos({ ...campos, [categoria]: e.target.value })}
                    placeholder="0,00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              ))}

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold text-gray-700">Total do dia</span>
                <span className="text-lg font-bold text-gray-800">
                  {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando || carregando}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} /> Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
