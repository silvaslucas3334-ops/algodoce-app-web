'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle, Loader, PackageCheck } from 'lucide-react'
import { buscarOrigemDoCriador, nomeUnidade, rotuloMotivo, Unidade } from '@/lib/expedicao'
import { LOCAL_LABEL } from '@/lib/constants'

interface LinhaConferencia {
  produto_id: string
  nome_produto: string
  unidade_medida: string
  qtd_ajustada: number
  etiquetas_selecionadas: string[]
  totalEtiquetas: number
  jaRecebida: boolean // todas as etiquetas dessa linha já estão na_loja
}

export default function ReceberRomaneioPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const params = useParams()
  const romaneioId = params.romaneio_id as string

  const [romaneio, setRomaneio] = useState<any>(null)
  const [origem, setOrigem] = useState<Unidade | null>(null)
  const [linhas, setLinhas] = useState<LinhaConferencia[]>([])
  const [conferidas, setConferidas] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [recebendo, setRecebendo] = useState(false)
  const [erroRecebimento, setErroRecebimento] = useState('')
  const [concluido, setConcluido] = useState<{ recebidas: number; jaRecebido: boolean } | null>(null)

  useEffect(() => {
    const carregarRomaneio = async () => {
      try {
        const { data, error } = await supabase
          .from('romaneios')
          .select('*')
          .eq('id', romaneioId)
          .single()

        if (error) throw error
        setRomaneio(data)
        // Envio sai sempre da cozinha; transferência, da unidade de quem criou.
        setOrigem(data.unidade_origem ?? (data.tipo === 'envio' ? 'cozinha' : await buscarOrigemDoCriador(data.criado_por)))

        // Verificar status atual de cada etiqueta para saber o que já foi recebido
        const todosLoteIds: string[] = (data.linhas || []).flatMap(
          (l: any) => l.etiquetas_selecionadas || []
        )

        const statusPorLote = new Map<string, string>()
        if (todosLoteIds.length > 0) {
          const { data: lotesData } = await supabase
            .from('lotes_producao')
            .select('id, status')
            .in('id', todosLoteIds)

          lotesData?.forEach((l: any) => statusPorLote.set(l.id, l.status))
        }

        const linhasConferencia: LinhaConferencia[] = (data.linhas || []).map((linha: any) => {
          const etiquetas = linha.etiquetas_selecionadas || []
          const jaRecebida =
            etiquetas.length > 0 && etiquetas.every((id: string) => statusPorLote.get(id) === 'na_loja')
          return {
            produto_id: linha.produto_id,
            nome_produto: linha.nome_produto,
            unidade_medida: linha.unidade_medida,
            qtd_ajustada: linha.qtd_ajustada,
            etiquetas_selecionadas: etiquetas,
            totalEtiquetas: etiquetas.length,
            jaRecebida,
          }
        })

        setLinhas(linhasConferencia)
        // Pré-marcar linhas já recebidas anteriormente (parcial)
        const conferidasIniciais: Record<string, boolean> = {}
        linhasConferencia.forEach((l) => {
          if (l.jaRecebida) conferidasIniciais[l.produto_id] = true
        })
        setConferidas(conferidasIniciais)
      } catch (err) {
        console.error('Erro:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarRomaneio()
  }, [romaneioId])

  function toggleConferida(produtoId: string, jaRecebida: boolean) {
    if (jaRecebida) return // já recebida em uma conferência anterior, não desmarca
    setConferidas((prev) => ({ ...prev, [produtoId]: !prev[produtoId] }))
  }

  // Recebe o romaneio INTEIRO numa operação única do banco (lib/migrations/expedicao-fase7b-...):
  // etiquetas, movimentações e o fechamento do romaneio entram juntos ou nada entra. A conferência
  // por produto abaixo é só uma ajuda visual — nunca deixa o romaneio pela metade. Se algo não
  // veio ou veio com problema, recebe-se assim mesmo e o usuário cria a transferência de volta.
  async function confirmarRecebimento() {
    if (!romaneio) return
    setRecebendo(true)
    setErroRecebimento('')
    try {
      const { data, error } = await supabase.rpc('receber_romaneio', { p_romaneio_id: romaneioId })
      if (error) throw error
      setConcluido({ recebidas: Number(data?.recebidas) || 0, jaRecebido: !!data?.ja_recebido })
    } catch (err: any) {
      console.error('Erro ao receber romaneio:', err)
      setErroRecebimento(err?.message || 'Erro desconhecido.')
    } finally {
      setRecebendo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen gap-2 text-gray-400">
        <Loader size={20} className="animate-spin" />
        Carregando romaneio...
      </div>
    )
  }

  if (!romaneio) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Romaneio não encontrado
      </div>
    )
  }

  // Recebido: mostra o resultado e o atalho para o caso de divergência física (a loja devolve à cozinha).
  if (concluido) {
    const destinoEhLoja = romaneio.unidade_destino === 'loja1' || romaneio.unidade_destino === 'loja2'
    const podeDevolver = destinoEhLoja && (usuario?.role === 'loja' || usuario?.role === 'admin')
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md w-full text-center">
          <CheckCircle size={44} className="mx-auto text-green-600 mb-3" />
          <h1 className="text-xl font-bold text-gray-800">{concluido.jaRecebido ? 'Este romaneio já estava recebido' : 'Romaneio recebido'}</h1>
          {!concluido.jaRecebido && (
            <p className="text-sm text-gray-600 mt-1">
              {concluido.recebidas} etiqueta(s) entraram no estoque de {LOCAL_LABEL[romaneio.unidade_destino] || romaneio.unidade_destino}.
            </p>
          )}
          <div className="mt-5 space-y-2">
            {podeDevolver && (
              <button
                onClick={() =>
                  router.push(`/expedicao/nova-transferencia?motivo=devolucao_saldo&origem=${romaneio.unidade_destino}`)
                }
                className="w-full px-4 py-3 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg font-semibold hover:bg-amber-100"
              >
                Houve divergência? Criar transferência para a cozinha
              </button>
            )}
            <button
              onClick={() => router.push('/expedicao')}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Voltar à Expedição
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalProdutos = linhas.length
  const totalConferidos = linhas.filter((l) => l.jaRecebida || conferidas[l.produto_id]).length
  const totalEtiquetas = linhas.reduce((sum, l) => sum + l.totalEtiquetas, 0)
  const totalEtiquetasConferidas = linhas
    .filter((l) => l.jaRecebida || conferidas[l.produto_id])
    .reduce((sum, l) => sum + l.totalEtiquetas, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Conferir Recebimento</h1>
            <p className="text-sm text-gray-600">
              De: {nomeUnidade(origem)} · Para: {LOCAL_LABEL[romaneio.unidade_destino] || romaneio.unidade_destino} · Entrega: {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
              {romaneio.tipo === 'transferencia' && romaneio.motivo && <span> · Motivo: {rotuloMotivo(romaneio.motivo)}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Progresso */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-800">
              {totalConferidos} de {totalProdutos} produtos conferidos
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {totalEtiquetasConferidas} de {totalEtiquetas} etiquetas
            </p>
          </div>
          <PackageCheck size={28} className="text-blue-400" />
        </div>

        <p className="text-sm text-gray-600 mb-1">
          Confira fisicamente cada produto e marque a caixa — é só uma ajuda para você.
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Ao confirmar, o romaneio <strong>inteiro</strong> é recebido e fecha. Se algo não veio ou veio com problema, receba assim mesmo e
          depois crie uma transferência para a cozinha informando o motivo.
        </p>

        {/* Lista de produtos */}
        <div className="space-y-3 mb-6">
          {linhas.map((linha) => {
            const marcada = linha.jaRecebida || !!conferidas[linha.produto_id]
            return (
              <label
                key={linha.produto_id}
                className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${
                  linha.jaRecebida
                    ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                    : marcada
                    ? 'bg-green-50 border-green-400 cursor-pointer'
                    : 'bg-white border-gray-200 hover:border-gray-300 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={marcada}
                  disabled={linha.jaRecebida}
                  onChange={() => toggleConferida(linha.produto_id, linha.jaRecebida)}
                  className="w-6 h-6 accent-green-600 flex-shrink-0"
                />
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">{linha.nome_produto}</p>
                  <p className="text-sm text-gray-600">
                    Quantidade: {linha.qtd_ajustada} {linha.unidade_medida} · Etiquetas: {linha.totalEtiquetas}
                  </p>
                  {linha.jaRecebida && (
                    <p className="text-xs text-gray-500 mt-0.5">Já recebido anteriormente</p>
                  )}
                </div>
                {marcada && <CheckCircle size={22} className="text-green-600 flex-shrink-0" />}
              </label>
            )
          })}
        </div>

        {erroRecebimento && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            <p className="font-semibold">Não foi possível receber. Nada foi gravado.</p>
            <p className="mt-0.5">{erroRecebimento}</p>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={() => router.back()}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
          >
            Voltar
          </button>
          <button
            onClick={confirmarRecebimento}
            disabled={recebendo}
            className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {recebendo ? (
              <>
                <Loader size={18} className="animate-spin" />
                Confirmando...
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                Receber tudo
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
