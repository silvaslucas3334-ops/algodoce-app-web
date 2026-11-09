'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader, X } from 'lucide-react'
import { LOCAL_LABEL } from '@/lib/constants'
import { ROTULO_MOTIVO } from '@/lib/estoque-baixa'
import { ProdutoPosicao } from '@/lib/estoque-posicao'
import {
  buscarKardex,
  buscarKardexResumo,
  intervaloKardex,
  KardexLinha,
  KardexResumo,
  PERIODOS_KARDEX,
  PeriodoKardex,
} from '@/lib/estoque-kardex'

const POR_PAGINA = 50

const TIPO: Record<string, { rotulo: string; cor: string }> = {
  entrada: { rotulo: 'Entrada', cor: 'bg-green-100 text-green-700' },
  saida: { rotulo: 'Baixa', cor: 'bg-red-100 text-red-700' },
  transferencia: { rotulo: 'Transferência', cor: 'bg-blue-100 text-blue-700' },
}

const unidade = (u: string | null) => (u ? LOCAL_LABEL[u] || u : '—')
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtDataCurta = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')

interface Props {
  produto: ProdutoPosicao
  onFechar: () => void
}

/** Painel lateral: saldo atual por unidade + histórico de movimentações do produto. */
export default function FichaProduto({ produto, onFechar }: Props) {
  const [periodo, setPeriodo] = useState<PeriodoKardex>('30d')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [unidadeFiltro, setUnidadeFiltro] = useState('')
  const [linhas, setLinhas] = useState<KardexLinha[]>([])
  const [total, setTotal] = useState(0)
  const [resumo, setResumo] = useState<KardexResumo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState('')

  const { inicio, fim } = useMemo(() => intervaloKardex(periodo, de, ate), [periodo, de, ate])

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro('')
    Promise.all([
      buscarKardex({ produtoId: produto.produtoId, inicio, fim, unidade: unidadeFiltro, limite: POR_PAGINA, deslocamento: 0 }),
      buscarKardexResumo({ produtoId: produto.produtoId, inicio, fim, unidade: unidadeFiltro }),
    ])
      .then(([k, r]) => {
        if (cancelado) return
        setLinhas(k.linhas)
        setTotal(k.total)
        setResumo(r)
      })
      .catch((e: any) => {
        if (!cancelado) setErro('Não foi possível carregar o histórico: ' + (e?.message || 'erro desconhecido'))
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [produto.produtoId, inicio, fim, unidadeFiltro])

  async function carregarMais() {
    setCarregandoMais(true)
    try {
      const k = await buscarKardex({ produtoId: produto.produtoId, inicio, fim, unidade: unidadeFiltro, limite: POR_PAGINA, deslocamento: linhas.length })
      setLinhas((prev) => {
        const ja = new Set(prev.map((l) => l.id))
        return [...prev, ...k.linhas.filter((l) => !ja.has(l.id))]
      })
      setTotal(k.total)
    } catch (e: any) {
      setErro('Erro ao carregar mais: ' + (e?.message || 'erro desconhecido'))
    } finally {
      setCarregandoMais(false)
    }
  }

  const saldo = (rotulo: string, c: { etiquetas: number }, destaque = false) => (
    <div className={`rounded-lg border p-2 text-center ${destaque && c.etiquetas > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className="text-lg font-bold text-gray-800">{c.etiquetas}</p>
    </div>
  )

  const numero = (rotulo: string, valor: number | undefined, tom = 'text-gray-800') => (
    <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className={`text-lg font-bold ${tom}`}>{valor ?? '—'}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} aria-hidden />
      <aside className="relative bg-gray-50 w-full sm:max-w-xl h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{produto.nome}</h2>
            <p className="text-xs text-gray-500">{produto.categoria} · ficha do produto</p>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar ficha">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Saldo atual (etiquetas)</h3>
            <div className="grid grid-cols-4 gap-2">
              {saldo('Cozinha', produto.cozinha)}
              {saldo('Paraisópolis', produto.loja1)}
              {saldo('Itajubá', produto.loja2)}
              {saldo('A caminho', produto.aCaminho, true)}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {PERIODOS_KARDEX.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    periodo === p.key ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodo === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={de || inicio} onChange={(e) => setDe(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" value={ate || fim} onChange={(e) => setAte(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <select
                value={unidadeFiltro}
                onChange={(e) => setUnidadeFiltro(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                <option value="">Todas as unidades</option>
                <option value="cozinha">Cozinha</option>
                <option value="loja1">Paraisópolis</option>
                <option value="loja2">Itajubá</option>
              </select>
              <span className="text-xs text-gray-400">
                {fmtDataCurta(inicio)} a {fmtDataCurta(fim)}
              </span>
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Resumo do período (em etiquetas)</h3>
            <div className="grid grid-cols-3 gap-2">
              {numero('Entradas', resumo?.entradas)}
              {numero('Transferências', resumo?.transferencias)}
              {numero('Baixas', resumo?.baixas)}
              {numero('Vendas', resumo?.vendas)}
              {numero('Perdas', resumo?.perdas, resumo && resumo.perdas > 0 ? 'text-red-600' : 'text-gray-800')}
              {numero('Estornos', resumo?.estornos)}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Entradas incluem recebimentos nas lojas; baixas não contam as que foram estornadas; perdas = vencido + quebra.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Movimentações{!carregando && ` (${total})`}
            </h3>
            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 text-sm text-red-700">{erro}</div>}
            {carregando ? (
              <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
            ) : linhas.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-400">Nenhuma movimentação neste período.</div>
            ) : (
              <div className="space-y-2">
                {linhas.map((l) => {
                  const t = TIPO[l.tipo] || { rotulo: l.tipo, cor: 'bg-gray-100 text-gray-600' }
                  return (
                    <div key={l.id} className={`bg-white border rounded-lg p-3 text-sm ${l.estorno ? 'border-amber-200' : 'border-gray-200'}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                        <span>{fmtDataHora(l.em)}</span>
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${t.cor}`}>{l.estorno ? 'Estorno' : t.rotulo}</span>
                        {l.motivo && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{ROTULO_MOTIVO[l.motivo] || l.motivo}</span>}
                        {l.estornado && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">estornada</span>}
                        <span className="ml-auto font-mono text-gray-400">{l.codigo_qr}</span>
                      </div>
                      <p className="mt-1 text-gray-800">
                        {unidade(l.local_origem)} <span className="text-gray-400">→</span> {unidade(l.local_destino)}
                        <span className="text-gray-400"> · </span>
                        {l.quantidade} {produto.unidadeMedida.toLowerCase().startsWith('gram') ? 'g' : 'un'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">por {l.registrado_por || '—'}</p>
                      {l.justificativa && <p className="text-xs text-amber-700 mt-1">Justificativa: {l.justificativa}</p>}
                    </div>
                  )
                })}
                {linhas.length < total && (
                  <div className="text-center pt-1">
                    <button
                      onClick={carregarMais}
                      disabled={carregandoMais}
                      className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {carregandoMais && <Loader size={14} className="animate-spin" />}
                      Carregar mais ({total - linhas.length} restantes)
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
