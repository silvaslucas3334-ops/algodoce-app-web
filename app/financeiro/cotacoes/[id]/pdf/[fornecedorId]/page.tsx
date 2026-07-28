'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import NotFoundState from '@/components/NotFoundState'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { UNIDADE_LABEL } from '@/lib/constants'

export default function CotacaoPdfPage() {
  const router = useRouter()
  const params = useParams()
  const cotacaoId = params.id as string
  const fornecedorId = params.fornecedorId as string

  const [cotacao, setCotacao] = useState<any>(null)
  const [fornecedor, setFornecedor] = useState<any>(null)
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregar()
  }, [cotacaoId, fornecedorId])

  // Consulta só cotacao_itens — nunca cotacao_precos. Este é o documento de
  // SAÍDA (pedido de cotação), enviado antes de qualquer resposta; não pode
  // expor preço nenhum, nem próprio nem de concorrente.
  async function carregar() {
    setLoading(true)
    const [{ data: cot }, { data: forn }, { data: itensData }] = await Promise.all([
      supabase
        .from('financeiro_cotacoes')
        .select('titulo, criado_em, unidade, data_entrega_planejada')
        .eq('id', cotacaoId)
        .single(),
      supabase
        .from('financeiro_cotacao_fornecedores')
        .select('id, parte:financeiro_partes!parte_id(nome)')
        .eq('id', fornecedorId)
        .eq('cotacao_id', cotacaoId)
        .maybeSingle(),
      supabase
        .from('financeiro_cotacao_itens')
        .select('*, materia_prima:financeiro_materias_primas(nome)')
        .eq('cotacao_id', cotacaoId),
    ])
    setCotacao(cot)
    setFornecedor(forn)
    setItens(itensData || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <div className="flex items-center justify-center min-h-screen text-gray-400">Carregando...</div>
      </ProtectedRoute>
    )
  }

  if (!cotacao || !fornecedor) {
    return (
      <ProtectedRoute allowedRoles={['admin']}>
        <NotFoundState title="Cotação ou fornecedor não encontrado" backHref={`/financeiro/cotacoes/${cotacaoId}`} />
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="bg-white">
        <style jsx global>{`
          @media print {
            .no-print { display: none !important; }
            body { margin: 0; padding: 0; }
          }
        `}</style>

        <div className="no-print p-4 bg-gray-50 border-b flex items-center justify-between">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-800 flex items-center gap-2">
            <ArrowLeft size={20} /> Voltar
          </button>
          <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
            <Printer size={18} /> Imprimir / Salvar PDF
          </button>
        </div>

        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center justify-center gap-3 mb-6 pb-4 border-b-2 border-gray-800">
            <OluquinhasLogo variant="rosto" color="marrom" size="sm" />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-800">AlgoDoce</h1>
              <p className="text-sm text-gray-600">Solicitação de Cotação</p>
            </div>
          </div>

          <div className="mb-6 text-sm text-gray-700 space-y-1">
            <p><strong>Cotação:</strong> {cotacao.titulo}</p>
            <p><strong>Fornecedor:</strong> {fornecedor.parte?.nome}</p>
            <p><strong>Data:</strong> {new Date(cotacao.criado_em).toLocaleDateString('pt-BR')}</p>
            <p><strong>Unidade de entrega:</strong> {UNIDADE_LABEL[cotacao.unidade as keyof typeof UNIDADE_LABEL] || cotacao.unidade}</p>
            {cotacao.data_entrega_planejada && (
              <p><strong>Entrega planejada:</strong> {new Date(cotacao.data_entrega_planejada + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            )}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-2 pr-2">Item</th>
                <th className="text-left py-2 pr-2">Qtd.</th>
                <th className="text-left py-2 pr-2">Unidade</th>
                <th className="text-left py-2 pr-2">Preço Unit.</th>
                <th className="text-left py-2">Preço Total</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id} className="border-b border-gray-300">
                  <td className="py-2 pr-2">
                    {item.materia_prima?.nome}
                    {item.observacao && <span className="block text-xs text-gray-500">{item.observacao}</span>}
                  </td>
                  <td className="py-2 pr-2">{item.quantidade}</td>
                  <td className="py-2 pr-2">{item.unidade_cotacao}</td>
                  <td className="py-2 pr-2">&nbsp;</td>
                  <td className="py-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="text-xs text-gray-400 mt-6">
            Por favor, preencha os preços e retorne para o solicitante.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  )
}
