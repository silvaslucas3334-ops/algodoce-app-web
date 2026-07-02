'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'

export default function OrdemProducaoPage() {
  const router = useRouter()
  const params = useParams()
  const [ordem, setOrdem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [navegando, setNavegando] = useState(false)

  useEffect(() => {
    carregarOrdem()
  }, [params.id])

  async function carregarOrdem() {
    setLoading(true)
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome, tipo, categoria:categorias(nome), unidade_medida, validade_dias, congelado)')
      .eq('id', params.id)
      .single()

    if (data) setOrdem(data)
    setLoading(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>
  }

  if (!ordem) {
    return <div className="text-center py-12 text-gray-400">Ordem não encontrada</div>
  }

  const dataEntrega = new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')
  const dataSolicitacao = new Date(ordem.data_solicitacao + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div className="bg-white">
      <style jsx global>{`
        @media print {
          * {
            margin: 0;
            padding: 0;
            border: 0;
          }
          body {
            margin: 0;
            padding: 0;
            width: 80mm;
            background: white;
          }
          html {
            width: 80mm;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 80mm !important;
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
          }
        }
      `}</style>

      {/* Cabeçalho */}
      <div className="no-print p-4 bg-gray-50 border-b flex items-center justify-between">
        <button onClick={() => {
          if (!navegando) {
            setNavegando(true)
            router.push('/producao')
          }
        }} disabled={navegando} className="text-gray-600 hover:text-gray-800 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
          <ArrowLeft size={20} /> Voltar
        </button>
        <h1 className="text-lg font-bold text-gray-800">Ordem de Produção #{ordem.numero_ordem}</h1>
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <Printer size={18} /> Imprimir
        </button>
      </div>

      {/* Documento 80mm */}
      <div className="p-8 flex justify-center">
        <div style={{ width: '80mm' }} className="bg-white print-container">

          {/* Cabeçalho */}
          <div className="text-center mb-3 pb-2 border-b-2 border-black">
            <h1 className="text-lg font-bold">AlgoDoce</h1>
            <p className="text-xs text-gray-600">Ordem de Produção</p>
          </div>

          {/* Número da ordem */}
          <div className="text-center mb-3">
            <p className="text-xs text-gray-600">Nº ORDEM</p>
            <p className="text-2xl font-bold">#{ordem.numero_ordem}</p>
          </div>

          {/* Produto - destaque */}
          <div className="mb-3 pb-2 border-b border-gray-300">
            <p className="text-xs text-gray-600 font-semibold">PRODUTO</p>
            <p className="text-sm font-bold break-words">{ordem.produto?.nome}</p>
            {ordem.produto?.congelado && (
              <p className="text-xs font-semibold text-blue-600 mt-1">❄️ CONGELADO</p>
            )}
          </div>

          {/* Quantidade - grande */}
          <div className="text-center mb-3 pb-2 border-b border-gray-300">
            <p className="text-xs text-gray-600">QUANTIDADE</p>
            <p className="text-3xl font-bold text-green-700">{ordem.quantidade}</p>
            <p className="text-xs text-gray-600">{ordem.produto?.unidade_medida}</p>
          </div>

          {/* Categoria e Tipo */}
          <div className="mb-3 pb-2 border-b border-gray-300">
            <div className="flex justify-between text-xs mb-1">
              <div>
                <p className="text-gray-600">Categoria</p>
                <p className="font-semibold">{ordem.produto?.categoria?.nome || 'Sem categoria'}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-600">Tipo</p>
                <p className="font-semibold">{ordem.produto?.tipo}</p>
              </div>
            </div>
          </div>

          {/* Informações */}
          <div className="mb-3 pb-2 border-b border-gray-300 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Loja Destino:</span>
              <span className="font-semibold">{LOCAL_LABEL[ordem.loja_destino]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Data Entrega:</span>
              <span className="font-semibold">{dataEntrega}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Solicitado por:</span>
              <span className="font-semibold">{ordem.solicitado_por}</span>
            </div>
          </div>

          {/* Observações */}
          {ordem.observacao && (
            <div className="mb-3 pb-2 border-b border-gray-300">
              <p className="text-xs text-gray-600 font-semibold">OBS:</p>
              <p className="text-xs break-words">{ordem.observacao}</p>
            </div>
          )}

          {/* Linha de corte */}
          <div className="text-center my-4">
            <p className="text-xs text-gray-400">✂ ✂ ✂ ✂ ✂ ✂ ✂ ✂</p>
          </div>
        </div>
      </div>
    </div>
  )
}
