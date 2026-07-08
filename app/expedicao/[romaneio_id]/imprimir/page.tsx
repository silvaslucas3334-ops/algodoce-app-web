'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams } from 'next/navigation'
import { Printer, AlertCircle } from 'lucide-react'

export default function ImprimirRomaneioPage() {
  const params = useParams()
  const romaneioId = params.romaneio_id as string
  const [romaneio, setRomaneio] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarRomaneio()
  }, [romaneioId])

  async function carregarRomaneio() {
    const { data } = await supabase
      .from('romaneios')
      .select('*')
      .eq('id', romaneioId)
      .single()

    if (data) {
      setRomaneio(data)
      setLoading(false)
      // Auto-dispara a impressão após carregar
      setTimeout(() => dispararImpressao(data), 300)
    }
  }

  function dispararImpressao(rom: any) {
    const dataEntrega = new Date(rom.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')
    const destino = LOCAL_LABEL[rom.unidade_destino] || rom.unidade_destino
    const linhas = rom.linhas || []
    const totalEtiquetas = linhas.reduce((sum: number, l: any) => sum + (l.etiquetas_selecionadas?.length || 0), 0)

    const produtosHtml = linhas
      .map((linha: any) => {
        const qtdEtiquetas = linha.etiquetas_selecionadas?.length || 0
        return `<div class="produto-bloco">
          <div class="produto-nome">${linha.nome_produto} &mdash; ${linha.qtd_ajustada} ${linha.unidade_medida}</div>
          <div class="produto-contador">${qtdEtiquetas} etiqueta${qtdEtiquetas === 1 ? '' : 's'}</div>
          ${linha.aviso ? `<div class="aviso">&#9888; ${linha.aviso}</div>` : ''}
        </div>`
      })
      .join('')

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Romaneio - ${dataEntrega}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          width: 80mm;
          background: white;
          font-family: Arial, Helvetica, sans-serif;
          font-weight: 700;
          color: #000;
        }
        .container {
          width: 80mm;
          padding: 10px;
        }
        .cabecalho {
          text-align: center;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 2px solid black;
        }
        .cabecalho h1 {
          font-size: 20px;
          font-weight: 800;
        }
        .cabecalho p {
          font-size: 13px;
          font-weight: 700;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .info-secao {
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 2px solid black;
        }
        .produto-bloco {
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px dashed #000;
        }
        .produto-nome {
          font-size: 15px;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .produto-contador {
          font-size: 13px;
          font-weight: 700;
        }
        .aviso {
          font-size: 12px;
          font-weight: 700;
          margin-top: 2px;
        }
        .rodape {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 2px solid black;
          font-size: 12px;
          font-weight: 800;
          text-align: center;
        }
        .linha-corte {
          text-align: center;
          margin: 12px 0;
          font-size: 12px;
          font-weight: 700;
        }
        @media print {
          body { width: 80mm; margin: 0; padding: 0; }
          .container { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="cabecalho">
          <h1>AlgoDoce</h1>
          <p>Romaneio de Envio</p>
        </div>
        <div class="info-secao">
          <div class="info-row"><span>Data Entrega:</span><span>${dataEntrega}</span></div>
          <div class="info-row"><span>Destino:</span><span>${destino}</span></div>
        </div>
        ${produtosHtml}
        <div class="rodape">
          ${linhas.length} produto(s) &middot; ${totalEtiquetas} etiqueta(s)
        </div>
        <div class="linha-corte">&#9986; &#9986; &#9986; &#9986; &#9986; &#9986; &#9986; &#9986;</div>
      </div>
      <script>
        window.print();
      </script>
    </body>
    </html>`

    const w = window.open()
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  function imprimirManualmente() {
    if (romaneio) {
      dispararImpressao(romaneio)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">Carregando romaneio...</p>
      </div>
    )
  }

  if (!romaneio) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Romaneio não encontrado</p>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex gap-2 mb-2">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-700">Impressão Automática</p>
            <p className="text-sm text-blue-600 mt-1">A janela de impressão deve ter aberto automaticamente.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">
          Romaneio {new Date(romaneio.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
        </p>
        <p className="text-sm text-gray-600">
          {romaneio.linhas?.length || 0} produto(s) &middot;{' '}
          {romaneio.linhas?.reduce((sum: number, l: any) => sum + (l.etiquetas_selecionadas?.length || 0), 0) || 0} etiqueta(s)
        </p>
      </div>

      <button
        onClick={imprimirManualmente}
        className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 mb-2"
      >
        <Printer size={18} /> Imprimir Novamente
      </button>

      <p className="text-xs text-gray-500 text-center">
        Se a janela não abriu, clique no botão acima. Se o pop-up foi bloqueado, permita pop-ups para este site.
      </p>
    </div>
  )
}
