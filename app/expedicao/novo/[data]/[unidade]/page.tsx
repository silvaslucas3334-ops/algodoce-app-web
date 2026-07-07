'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader, AlertTriangle, CheckCircle2, Package } from 'lucide-react'

interface LoteEstoque {
  id: string
  codigo_qr: string
  produto_id: string
  quantidade: number
  peso_gramas: number | null
  data_validade: string
}

interface ProdutoBase {
  produto_id: string
  produto_nome: string
  unidade_medida: string
  etiquetas_disponiveis: LoteEstoque[]
}

interface ProdutoPedido extends ProdutoBase {
  qtd_pedida: number
  ordem_ids: string[]
  ordens_numeros: number[]
}

type ProdutoExtra = ProdutoBase

export default function VerificacaoOrdensPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const data = params.data as string
  const unidade = params.unidade as string

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [produtosPedidos, setProdutosPedidos] = useState<ProdutoPedido[]>([])
  const [produtosExtras, setProdutosExtras] = useState<ProdutoExtra[]>([])
  const [selecoes, setSelecoes] = useState<Record<string, string[]>>({})
  const [semOrdens, setSemOrdens] = useState(false)
  const [mostrarExtras, setMostrarExtras] = useState(false)

  useEffect(() => {
    const carregar = async () => {
      try {
        // Ordens emitidas para essa data/unidade, ainda não finalizadas
        const { data: ordensData } = await supabase
          .from('ordens_producao')
          .select('id, numero_ordem, produto_id, quantidade, produto:produtos(nome, unidade_medida)')
          .eq('data_entrega', data)
          .eq('loja_destino', unidade)
          .in('status', ['pendente', 'em_producao'])
          .order('numero_ordem')

        // Romaneios já confirmados para excluir ordens já enviadas
        const { data: romaneiosEnviados } = await supabase
          .from('romaneios')
          .select('linhas')
          .eq('data_entrega', data)
          .eq('unidade_destino', unidade)
          .eq('status', 'confirmado')

        const ordemIdJaEnviadas = new Set<string>()
        romaneiosEnviados?.forEach((rom: any) => {
          rom.linhas?.forEach((linha: any) => {
            linha.ordem_ids?.forEach((oid: string) => ordemIdJaEnviadas.add(oid))
          })
        })

        const ordensAbertas = (ordensData || []).filter((o: any) => !ordemIdJaEnviadas.has(o.id))

        // Estoque disponível na cozinha para essa unidade (FEFO)
        const { data: lotesData } = await supabase
          .from('lotes_producao')
          .select('id, codigo_qr, produto_id, quantidade, peso_gramas, data_validade, produto:produtos(nome, unidade_medida)')
          .eq('status', 'na_cozinha')
          .eq('destino', unidade)
          .order('data_validade')

        // Agrupar ordens por produto
        const agrupado = new Map<string, ProdutoPedido>()
        ordensAbertas.forEach((ord: any) => {
          const key = ord.produto_id
          if (!agrupado.has(key)) {
            agrupado.set(key, {
              produto_id: key,
              produto_nome: ord.produto?.nome || 'Desconhecido',
              unidade_medida: ord.produto?.unidade_medida || 'Unidade',
              qtd_pedida: 0,
              ordem_ids: [],
              ordens_numeros: [],
              etiquetas_disponiveis: [],
            })
          }
          const prod = agrupado.get(key)!
          prod.qtd_pedida += ord.quantidade
          prod.ordem_ids.push(ord.id)
          prod.ordens_numeros.push(ord.numero_ordem)
        })

        // Anexar etiquetas disponíveis (FEFO) e gerar sugestão automática
        const sugestaoInicial: Record<string, string[]> = {}
        agrupado.forEach((prod) => {
          const lotesProduto = (lotesData || []).filter((l: any) => l.produto_id === prod.produto_id)
          prod.etiquetas_disponiveis = lotesProduto

          let qtdAcumulada = 0
          const selecionadas: string[] = []
          for (const lote of lotesProduto) {
            if (qtdAcumulada >= prod.qtd_pedida) break
            selecionadas.push(lote.id)
            qtdAcumulada += lote.quantidade || lote.peso_gramas || 0
          }
          sugestaoInicial[prod.produto_id] = selecionadas
        })

        // Estoque adicional: produtos com etiquetas disponíveis que não têm pedido algum
        const extrasMap = new Map<string, ProdutoExtra>()
        ;(lotesData || []).forEach((lote: any) => {
          if (agrupado.has(lote.produto_id)) return // já coberto pelas sugestões
          if (!extrasMap.has(lote.produto_id)) {
            extrasMap.set(lote.produto_id, {
              produto_id: lote.produto_id,
              produto_nome: lote.produto?.nome || 'Desconhecido',
              unidade_medida: lote.produto?.unidade_medida || 'Unidade',
              etiquetas_disponiveis: [],
            })
          }
          extrasMap.get(lote.produto_id)!.etiquetas_disponiveis.push(lote)
        })

        setProdutosPedidos(Array.from(agrupado.values()))
        setProdutosExtras(Array.from(extrasMap.values()))
        setSelecoes(sugestaoInicial)
        setSemOrdens(agrupado.size === 0)
        setLoading(false)
      } catch (err) {
        console.error('Erro:', err)
        setLoading(false)
      }
    }

    carregar()
  }, [data, unidade])

  function toggleEtiqueta(produtoId: string, loteId: string) {
    setSelecoes((prev) => {
      const atuais = prev[produtoId] || []
      const novasSelecionadas = atuais.includes(loteId)
        ? atuais.filter((id) => id !== loteId)
        : [...atuais, loteId]
      return { ...prev, [produtoId]: novasSelecionadas }
    })
  }

  function totalSelecionado(produto: ProdutoBase): number {
    const selecionadas = selecoes[produto.produto_id] || []
    return selecionadas.reduce((acc, loteId) => {
      const lote = produto.etiquetas_disponiveis.find((e) => e.id === loteId)
      return acc + (lote?.quantidade || lote?.peso_gramas || 0)
    }, 0)
  }

  async function criarRomaneio() {
    // A sugestão é apenas uma ferramenta de apoio (compara pedido x estoque, evita
    // esquecer itens pedidos). O romaneio em si é livre: pode conter qualquer
    // etiqueta selecionada, inclusive fora das sugestões. Só não pode ficar vazio —
    // produto sem etiqueta selecionada não vira linha (não é "estoque fantasma").
    const linhasPedidos = produtosPedidos
      .filter((prod) => (selecoes[prod.produto_id] || []).length > 0)
      .map((prod) => {
        const selecionadas = selecoes[prod.produto_id] || []
        const qtdSelecionada = totalSelecionado(prod)
        const aviso =
          qtdSelecionada < prod.qtd_pedida
            ? `Enviando ${qtdSelecionada} de ${prod.qtd_pedida} pedidos — ${prod.qtd_pedida - qtdSelecionada} faltam`
            : null

        return {
          produto_id: prod.produto_id,
          nome_produto: prod.produto_nome,
          unidade_medida: prod.unidade_medida,
          qtd_pedida: prod.qtd_pedida,
          qtd_sugerida: qtdSelecionada,
          qtd_ajustada: qtdSelecionada,
          ordem_ids: prod.ordem_ids,
          etiquetas_selecionadas: selecionadas,
          etiquetas_disponiveis: prod.etiquetas_disponiveis,
          aviso,
        }
      })

    const linhasExtras = produtosExtras
      .filter((prod) => (selecoes[prod.produto_id] || []).length > 0)
      .map((prod) => {
        const selecionadas = selecoes[prod.produto_id] || []
        const qtdSelecionada = totalSelecionado(prod)

        return {
          produto_id: prod.produto_id,
          nome_produto: prod.produto_nome,
          unidade_medida: prod.unidade_medida,
          qtd_pedida: 0,
          qtd_sugerida: qtdSelecionada,
          qtd_ajustada: qtdSelecionada,
          ordem_ids: [],
          etiquetas_selecionadas: selecionadas,
          etiquetas_disponiveis: prod.etiquetas_disponiveis,
          aviso: null,
        }
      })

    const linhas = [...linhasPedidos, ...linhasExtras]

    if (linhas.length === 0) {
      alert('Não é possível criar um romaneio sem etiquetas selecionadas. Selecione ao menos uma etiqueta.')
      return
    }

    setSalvando(true)
    try {
      const response = await fetch('/api/romaneios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_entrega: data,
          status: 'rascunho',
          criado_por: usuario?.id || null,
          unidade_destino: unidade,
          tipo: 'envio',
          linhas,
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error)

      router.push(`/expedicao/${result.data.id}`)
    } catch (err) {
      console.error('Erro:', err)
      alert('Erro ao criar romaneio')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando ordens e estoque...
      </div>
    )
  }

  const unidadeNome = unidade === 'loja1' ? 'Paraisópolis' : 'Itajubá'
  const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header da página (fundo) */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push('/expedicao/novo')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Novo Romaneio</h1>
            <p className="text-sm text-gray-600">
              {dataFormatada} · {unidadeNome}
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Sugestões (Step 2) */}
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
            <h2 className="text-xl font-bold text-gray-800">Sugestões</h2>
            <p className="text-sm text-gray-600 mt-1">
              Comparação entre o que foi pedido e as etiquetas sugeridas, para não esquecer nenhum item. Ajuste a
              seleção livremente.
            </p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {semOrdens && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700">
                  Nenhum pedido pendente para {dataFormatada} em {unidadeNome}.
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Você ainda pode montar um romaneio manualmente com o estoque disponível abaixo.
                </p>
              </div>
            )}

            {produtosPedidos.map((produto) => {
              const selecionadas = selecoes[produto.produto_id] || []
              const qtdSelecionada = totalSelecionado(produto)
              const completo = qtdSelecionada >= produto.qtd_pedida
              const semEstoque = produto.etiquetas_disponiveis.length === 0

              return (
                <div
                  key={produto.produto_id}
                  className={`rounded-lg border-2 overflow-hidden ${
                    semEstoque
                      ? 'border-amber-300 bg-amber-50'
                      : completo
                      ? 'border-green-300 bg-green-50'
                      : 'border-amber-300 bg-amber-50'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <p className="font-bold text-gray-800">{produto.produto_nome}</p>
                        <p className="text-xs text-gray-500">
                          Ordem{produto.ordens_numeros.length > 1 ? 's' : ''} #{produto.ordens_numeros.join(', #')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">
                          Pedido: <span className="font-bold text-gray-800">{produto.qtd_pedida}</span>{' '}
                          {produto.unidade_medida}
                        </p>
                        <p className="text-sm">
                          Sugerido:{' '}
                          <span className={`font-bold ${completo ? 'text-green-700' : 'text-amber-700'}`}>
                            {qtdSelecionada}
                          </span>{' '}
                          {produto.unidade_medida}
                        </p>
                      </div>
                    </div>

                    {semEstoque ? (
                      <div className="flex items-center gap-2 mt-2 text-amber-700 text-xs font-semibold">
                        <AlertTriangle size={14} />
                        Nenhuma etiqueta em estoque para este item — ainda em produção ou faltando
                      </div>
                    ) : (
                      <>
                        {!completo && (
                          <div className="flex items-center gap-2 mt-2 text-amber-700 text-xs font-semibold">
                            <AlertTriangle size={14} />
                            Estoque insuficiente: faltam {produto.qtd_pedida - qtdSelecionada} {produto.unidade_medida}
                          </div>
                        )}
                        {completo && (
                          <div className="flex items-center gap-2 mt-2 text-green-700 text-xs font-semibold">
                            <CheckCircle2 size={14} />
                            Pedido totalmente atendido
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {!semEstoque && (
                    <div className="bg-white border-t border-gray-200 px-4 py-3 space-y-2">
                      {produto.etiquetas_disponiveis.map((etiqueta) => (
                        <label
                          key={etiqueta.id}
                          className="flex items-center gap-3 p-1.5 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selecionadas.includes(etiqueta.id)}
                            onChange={() => toggleEtiqueta(produto.produto_id, etiqueta.id)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <div className="flex-1 text-sm">
                            <p className="font-mono text-gray-800">{etiqueta.codigo_qr}</p>
                            <p className="text-xs text-gray-600">
                              {etiqueta.quantidade || etiqueta.peso_gramas} {produto.unidade_medida} · Val:{' '}
                              {new Date(etiqueta.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Estoque adicional — fora das sugestões, inclusão manual */}
            {produtosExtras.length > 0 && (
              <div className="border-t border-gray-200 pt-5">
                <button
                  onClick={() => setMostrarExtras((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-700 text-sm">
                    <Package size={16} />
                    Estoque adicional disponível ({produtosExtras.length} produto
                    {produtosExtras.length > 1 ? 's' : ''} sem pedido)
                  </span>
                  <span className="text-xs text-gray-500">{mostrarExtras ? 'Ocultar' : 'Mostrar'}</span>
                </button>

                {mostrarExtras && (
                  <div className="mt-3 space-y-3">
                    {produtosExtras.map((produto) => {
                      const selecionadas = selecoes[produto.produto_id] || []
                      const qtdSelecionada = totalSelecionado(produto)
                      return (
                        <div key={produto.produto_id} className="rounded-lg border border-gray-200 overflow-hidden">
                          <div className="p-3 bg-gray-50 flex justify-between items-center">
                            <p className="font-semibold text-gray-800 text-sm">{produto.produto_nome}</p>
                            {qtdSelecionada > 0 && (
                              <span className="text-xs font-bold text-blue-700">
                                {qtdSelecionada} {produto.unidade_medida} selecionado
                              </span>
                            )}
                          </div>
                          <div className="bg-white px-3 py-2 space-y-2">
                            {produto.etiquetas_disponiveis.map((etiqueta) => (
                              <label
                                key={etiqueta.id}
                                className="flex items-center gap-3 p-1.5 hover:bg-gray-50 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selecionadas.includes(etiqueta.id)}
                                  onChange={() => toggleEtiqueta(produto.produto_id, etiqueta.id)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                <div className="flex-1 text-sm">
                                  <p className="font-mono text-gray-800">{etiqueta.codigo_qr}</p>
                                  <p className="text-xs text-gray-600">
                                    {etiqueta.quantidade || etiqueta.peso_gramas} {produto.unidade_medida} · Val:{' '}
                                    {new Date(etiqueta.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6 flex gap-3">
            <button
              onClick={() => router.push('/expedicao/novo')}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={criarRomaneio}
              disabled={salvando}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {salvando ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Criando...
                </>
              ) : (
                'Confirmar e Continuar'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
