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
  const [modo80mm, setModo80mm] = useState(false)

  useEffect(() => {
    carregarOrdem()
  }, [params.id])

  async function carregarOrdem() {
    setLoading(true)
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome, tipo, categoria, unidade_medida, validade_dias, congelado)')
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

  if (modo80mm) {
    return (
      <div className="bg-white">
        {/* Cabeçalho */}
        <div className="no-print p-4 bg-gray-50 border-b flex items-center justify-between">
          <button onClick={() => setModo80mm(false)} className="text-gray-600 hover:text-gray-800 flex items-center gap-2">
            <ArrowLeft size={20} /> Voltar para A4
          </button>
          <h1 className="text-lg font-bold text-gray-800">Modo Thermal 80mm</h1>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
            <Printer size={18} /> Imprimir
          </button>
        </div>

        {/* Documento 80mm */}
        <div className="print:p-0 p-8 flex justify-center">
          <div style={{ width: '80mm' }} className="bg-white">
            <style jsx>{`
              @media print {
                body { margin: 0; padding: 0; width: 80mm; }
                .no-print { display: none !important; }
                * { margin: 0; padding: 0; }
              }
            `}</style>

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
                  <p className="font-semibold">{ordem.produto?.categoria}</p>
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

  return (
    <div className="min-h-screen bg-white">
      {/* Cabeçalho para tela */}
      <div className="no-print p-4 bg-gray-50 border-b flex items-center justify-between">
        <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-800 flex items-center gap-2">
          <ArrowLeft size={20} /> Voltar
        </button>
        <h1 className="text-lg font-bold text-gray-800">Ordem de Produção #{ordem.numero_ordem}</h1>
        <div className="flex gap-2">
          <button onClick={() => setModo80mm(true)} className="bg-orange-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-orange-700">
            80mm Thermal
          </button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
            <Printer size={18} /> Imprimir A4
          </button>
        </div>
      </div>

      {/* Documento para impressão A4 */}
      <div className="print:p-0 p-8">
        <div className="max-w-2xl mx-auto bg-white print:max-w-full">
          {/* Cabeçalho */}
          <div className="text-center mb-8 pb-6 border-b-2 border-gray-800">
            <h1 className="text-4xl font-bold text-gray-900">AlgoDoce</h1>
            <p className="text-xl text-gray-600 mt-1">Ordem de Produção</p>
          </div>

          {/* Número da ordem */}
          <div className="mb-8">
            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Número da Ordem</p>
              <p className="text-5xl font-bold text-gray-900">#{ordem.numero_ordem}</p>
            </div>
          </div>

          {/* Seção do Produto */}
          <div className="mb-8 pb-6 border-b border-gray-300">
            <h2 className="text-lg font-bold text-gray-800 mb-4 uppercase tracking-wide">Produto</h2>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-sm text-gray-600 uppercase">Nome do Produto</p>
              <p className="text-3xl font-bold text-gray-900 mb-4">{ordem.produto?.nome}</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 uppercase">Categoria</p>
                  <p className="text-xl font-semibold text-gray-800">{ordem.produto?.categoria}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 uppercase">Tipo</p>
                  <p className="text-xl font-semibold text-gray-800">{ordem.produto?.tipo}</p>
                </div>
              </div>

              {ordem.produto?.congelado && (
                <div className="mt-4 p-3 bg-blue-100 border-l-4 border-blue-600">
                  <p className="text-blue-900 font-semibold">❄️ Produto Congelado</p>
                </div>
              )}
            </div>
          </div>

          {/* Quantidade */}
          <div className="mb-8 pb-6 border-b border-gray-300">
            <h2 className="text-lg font-bold text-gray-800 mb-4 uppercase tracking-wide">Quantidade</h2>
            <div className="bg-green-50 p-6 rounded-lg text-center">
              <p className="text-6xl font-bold text-green-700">{ordem.quantidade}</p>
              <p className="text-lg text-gray-600 mt-2">{ordem.produto?.unidade_medida}</p>
            </div>
          </div>

          {/* Informações importantes */}
          <div className="mb-8 pb-6 border-b border-gray-300">
            <h2 className="text-lg font-bold text-gray-800 mb-4 uppercase tracking-wide">Informações</h2>
            <div className="space-y-4">
              <div className="flex justify-between items-start border-b pb-3">
                <span className="text-gray-600 font-semibold">Loja Destino:</span>
                <span className="text-2xl font-bold text-gray-900">{LOCAL_LABEL[ordem.loja_destino]}</span>
              </div>
              <div className="flex justify-between items-start border-b pb-3">
                <span className="text-gray-600 font-semibold">Data de Entrega:</span>
                <span className="text-xl font-semibold text-gray-900">{dataEntrega}</span>
              </div>
              <div className="flex justify-between items-start border-b pb-3">
                <span className="text-gray-600 font-semibold">Data de Solicitação:</span>
                <span className="text-lg text-gray-600">{dataSolicitacao}</span>
              </div>
              <div className="flex justify-between items-start">
                <span className="text-gray-600 font-semibold">Solicitado por:</span>
                <span className="text-lg font-semibold text-gray-900">{ordem.solicitado_por}</span>
              </div>
            </div>
          </div>

          {/* Observações */}
          {ordem.observacao && (
            <div className="mb-8 pb-6 border-b border-gray-300">
              <h2 className="text-lg font-bold text-gray-800 mb-4 uppercase tracking-wide">Observações</h2>
              <div className="bg-yellow-50 p-6 rounded-lg border-l-4 border-yellow-500">
                <p className="text-lg text-gray-800 whitespace-pre-wrap">{ordem.observacao}</p>
              </div>
            </div>
          )}

          {/* Rodapé */}
          <div className="mt-8 pt-6 border-t-2 border-gray-800 text-center">
            <p className="text-sm text-gray-600">Impresso em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
            <p className="text-xs text-gray-400 mt-2">© AlgoDoce - Sistema de Gestão de Produção</p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .no-print {
            display: none !important;
          }
          .max-w-2xl {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  )
}
