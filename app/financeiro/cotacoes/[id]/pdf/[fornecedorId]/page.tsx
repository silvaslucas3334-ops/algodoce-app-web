'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ProtectedRoute from '@/components/ProtectedRoute'
import NotFoundState from '@/components/NotFoundState'
import OluquinhasLogo from '@/components/OluquinhasLogo'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Loader } from 'lucide-react'
import { UNIDADE_LABEL } from '@/lib/constants'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'

// Quantidade da cotação é sempre lançada na unidade_compra da matéria-prima
// (o que a gente precisa) — nunca muda. Quando a matéria-prima tem
// unidade_fornecedor + fator_unidade_fornecedor cadastrados (ex: pacote de
// 5kg), traduz pra quantos pacotes pedir, arredondando pra cima (não dá pra
// pedir meio pacote) e mostrando o equivalente em unidade_compra ao lado
// pra conferência.
function quantidadeParaFornecedor(item: any): { qtd: string; unidade: string } {
  const mp = item.materia_prima
  if (mp?.unidade_fornecedor && mp?.fator_unidade_fornecedor) {
    const pacotes = Math.ceil(item.quantidade / mp.fator_unidade_fornecedor)
    const equivalente = pacotes * mp.fator_unidade_fornecedor
    return {
      qtd: String(pacotes),
      unidade: `${mp.unidade_fornecedor} (≈ ${equivalente.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${item.unidade_cotacao})`,
    }
  }
  return { qtd: String(item.quantidade), unidade: item.unidade_cotacao }
}

// SVG não entra direto num jsPDF — rasteriza num canvas em memória primeiro.
// Se falhar por qualquer motivo, o PDF sai só com o cabeçalho em texto (não
// bloqueia a geração do documento).
function carregarLogoPng(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.width = 200
    img.height = 200
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 200
        canvas.height = 200
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, 200, 200)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = '/rosto_marrom.svg'
  })
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
}

export default function CotacaoPdfPage() {
  const router = useRouter()
  const params = useParams()
  const cotacaoId = params.id as string
  const fornecedorId = params.fornecedorId as string

  const [cotacao, setCotacao] = useState<any>(null)
  const [fornecedor, setFornecedor] = useState<any>(null)
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [gerandoPdf, setGerandoPdf] = useState(false)

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
        .select('*, materia_prima:financeiro_materias_primas(nome, unidade_fornecedor, fator_unidade_fornecedor)')
        .eq('cotacao_id', cotacaoId),
    ])
    setCotacao(cot)
    setFornecedor(forn)
    setItens(itensData || [])
    setLoading(false)
  }

  async function baixarPdf() {
    if (!cotacao || !fornecedor) return
    setGerandoPdf(true)
    try {
      const doc = new jsPDF()
      const logoPng = await carregarLogoPng()
      const inicioTexto = logoPng ? 36 : 14

      if (logoPng) doc.addImage(logoPng, 'PNG', 14, 10, 18, 18)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('AlgoDoce', inicioTexto, 20)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      doc.text('Solicitação de Cotação', inicioTexto, 27)

      let y = 40
      doc.setFontSize(10)
      const linhasMeta = [
        `Cotação: ${cotacao.titulo}`,
        `Fornecedor: ${fornecedor.parte?.nome || ''}`,
        `Data: ${new Date(cotacao.criado_em).toLocaleDateString('pt-BR')}`,
        `Unidade de entrega: ${UNIDADE_LABEL[cotacao.unidade as keyof typeof UNIDADE_LABEL] || cotacao.unidade}`,
      ]
      if (cotacao.data_entrega_planejada) {
        linhasMeta.push(
          `Entrega planejada: ${new Date(cotacao.data_entrega_planejada + 'T00:00:00').toLocaleDateString('pt-BR')}`
        )
      }
      linhasMeta.forEach((linha) => {
        doc.text(linha, 14, y)
        y += 6
      })

      autoTable(doc, {
        startY: y + 4,
        head: [['Item', 'Qtd.', 'Unidade', 'Preço Unit.', 'Preço Total']],
        body: itens.map((item) => {
          const q = quantidadeParaFornecedor(item)
          const nome = item.observacao ? `${item.materia_prima?.nome}\n${item.observacao}` : item.materia_prima?.nome || ''
          return [nome, q.qtd, q.unidade, '', '']
        }),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [55, 65, 81] },
      })

      const finalY = (doc as any).lastAutoTable?.finalY || y + 20
      doc.setFontSize(9)
      doc.setTextColor(140)
      doc.text('Por favor, preencha os preços e retorne para o solicitante.', 14, finalY + 10)

      doc.save(`cotacao-${slug(cotacao.titulo)}-${slug(fornecedor.parte?.nome || 'fornecedor')}.pdf`)
    } finally {
      setGerandoPdf(false)
    }
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
      <div className="bg-white min-h-screen">
        <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
          <button onClick={() => router.back()} className="text-gray-600 hover:text-gray-800 flex items-center gap-2">
            <ArrowLeft size={20} /> Voltar
          </button>
          <button
            onClick={baixarPdf}
            disabled={gerandoPdf}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {gerandoPdf ? <Loader size={18} className="animate-spin" /> : <Download size={18} />}
            {gerandoPdf ? 'Gerando...' : 'Baixar PDF'}
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
              {itens.map((item) => {
                const q = quantidadeParaFornecedor(item)
                return (
                  <tr key={item.id} className="border-b border-gray-300">
                    <td className="py-2 pr-2">
                      {item.materia_prima?.nome}
                      {item.observacao && <span className="block text-xs text-gray-500">{item.observacao}</span>}
                    </td>
                    <td className="py-2 pr-2">{q.qtd}</td>
                    <td className="py-2 pr-2">{q.unidade}</td>
                    <td className="py-2 pr-2">&nbsp;</td>
                    <td className="py-2">&nbsp;</td>
                  </tr>
                )
              })}
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
