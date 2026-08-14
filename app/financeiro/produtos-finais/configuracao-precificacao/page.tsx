'use client'
import { useEffect, useState } from 'react'
import ProtectedRoute from '@/components/ProtectedRoute'
import PageHeader from '@/components/PageHeader'
import { useRouter } from 'next/navigation'
import { Loader, Lightbulb } from 'lucide-react'
import { formatBRL } from '@/lib/ofx'
import {
  buscarConfigPrecificacao,
  salvarConfigPrecificacao,
  buscarSugestaoDespesasVariaveis,
  calcularIndiceMarkup,
  calcularPrecoSugerido,
  SugestaoDespesasVariaveis,
} from '@/lib/financeiro-precificacao'
import { FinanceiroConfigPrecificacao } from '@/lib/types'

const CUSTO_EXEMPLO = 10

function CampoPercentual({
  label,
  valor,
  onChange,
  sugestao,
  ajuda,
}: {
  label: string
  valor: number
  onChange: (v: number) => void
  sugestao?: number | null
  ajuda?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="any"
          min={0}
          max={100}
          value={valor}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
        />
        <span className="text-sm text-gray-500">%</span>
        {sugestao != null && (
          <button
            type="button"
            onClick={() => onChange(Number(sugestao.toFixed(2)))}
            className="text-xs font-medium text-pink-700 hover:text-pink-800 flex items-center gap-1"
          >
            <Lightbulb size={12} /> Usar {sugestao.toFixed(1)}% (últimos 30 dias)
          </button>
        )}
      </div>
      {ajuda && <p className="text-xs text-gray-400 mt-1">{ajuda}</p>}
    </div>
  )
}

export default function ConfiguracaoPrecificacaoPage() {
  const router = useRouter()
  const [config, setConfig] = useState<FinanceiroConfigPrecificacao | null>(null)
  const [sugestao, setSugestao] = useState<SugestaoDespesasVariaveis | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [salvo, setSalvo] = useState(false)

  useEffect(() => {
    Promise.all([buscarConfigPrecificacao(), buscarSugestaoDespesasVariaveis(30)])
      .then(([configData, sugestaoData]) => {
        setConfig(configData)
        setSugestao(sugestaoData)
      })
      .catch((err) => setErro('Erro ao carregar: ' + (err?.message || 'desconhecido')))
      .finally(() => setLoading(false))
  }, [])

  async function salvar() {
    if (!config) return
    setSalvando(true)
    setErro('')
    setSalvo(false)
    try {
      await salvarConfigPrecificacao(config.id, {
        taxa_cartao_pct: config.taxa_cartao_pct,
        comissao_marketplace_pct: config.comissao_marketplace_pct,
        imposto_venda_pct: config.imposto_venda_pct,
        custos_fixos_pct: config.custos_fixos_pct,
        margem_lucro_padrao_pct: config.margem_lucro_padrao_pct,
      })
      setSalvo(true)
    } catch (err: any) {
      setErro('Erro ao salvar: ' + (err?.message || 'desconhecido'))
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
          <Loader size={20} className="animate-spin" /> Carregando...
        </div>
      </ProtectedRoute>
    )
  }

  if (!config) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <PageHeader title="Configuração de Precificação" onBack={() => router.back()} />
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {erro || 'Não foi possível carregar a configuração.'}
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  const dvPct = config.taxa_cartao_pct + config.comissao_marketplace_pct + config.imposto_venda_pct
  const indice = calcularIndiceMarkup(config.custos_fixos_pct, dvPct, config.margem_lucro_padrao_pct)
  const somaExcedeu = config.custos_fixos_pct + dvPct + config.margem_lucro_padrao_pct >= 100

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <PageHeader title="Configuração de Precificação" onBack={() => router.back()} />

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <p className="text-xs text-gray-500">
            Esses percentuais são usados pra sugerir o preço ideal de cada Produto Final (markup) e pra calcular a margem de
            contribuição quando você informa o preço praticado. São valores do negócio como um todo — só a margem de lucro
            pode ser ajustada por produto, na tela de cada um.
          </p>

          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}
          {salvo && <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">Salvo.</div>}

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Despesas variáveis (% do preço de venda)</h2>
            <CampoPercentual
              label="Taxa de cartão"
              valor={config.taxa_cartao_pct}
              onChange={(v) => setConfig({ ...config, taxa_cartao_pct: v })}
              sugestao={sugestao?.taxaCartaoPct ?? null}
            />
            <CampoPercentual
              label="Comissão de marketplace (iFood/Aiqfome)"
              valor={config.comissao_marketplace_pct}
              onChange={(v) => setConfig({ ...config, comissao_marketplace_pct: v })}
              sugestao={sugestao?.taxaMarketplacePct ?? null}
            />
            <CampoPercentual
              label="Imposto sobre venda"
              valor={config.imposto_venda_pct}
              onChange={(v) => setConfig({ ...config, imposto_venda_pct: v })}
              ajuda="Ex: Simples Nacional (DAS), conforme a faixa de faturamento."
            />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Custos fixos rateados (% do preço de venda)</h2>
            <CampoPercentual
              label="Custos fixos"
              valor={config.custos_fixos_pct}
              onChange={(v) => setConfig({ ...config, custos_fixos_pct: v })}
              ajuda="Some aluguel, salários fixos, contas etc. do mês e divida pelo faturamento médio mensal — o resultado é essa %."
            />
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-gray-800">Margem de lucro padrão (% do preço de venda)</h2>
            <CampoPercentual
              label="Margem de lucro desejada"
              valor={config.margem_lucro_padrao_pct}
              onChange={(v) => setConfig({ ...config, margem_lucro_padrao_pct: v })}
              ajuda="Usada em todo produto que não tiver uma margem própria definida na sua tela."
            />
          </div>

          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-pink-800 mb-1">Exemplo com esses valores</p>
            {somaExcedeu || indice == null ? (
              <p className="text-sm text-red-700">
                A soma das % passou de 100 — nenhum preço é possível assim. Reduza algum valor.
              </p>
            ) : (
              <p className="text-sm text-pink-900">
                Um item com custo de {formatBRL(CUSTO_EXEMPLO)} teria preço sugerido de{' '}
                <strong>{formatBRL(calcularPrecoSugerido(CUSTO_EXEMPLO, indice))}</strong> (índice de markup {indice.toFixed(3)}).
              </p>
            )}
          </div>

          <button
            onClick={salvar}
            disabled={salvando}
            className="w-full bg-pink-700 text-white rounded-lg py-3 font-medium disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </ProtectedRoute>
  )
}
