'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams } from 'next/navigation'
import { Printer, AlertCircle } from 'lucide-react'

export default function ImprimirOrdemPage() {
  const params = useParams()
  const [ordem, setOrdem] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarOrdem()
  }, [params.id])

  async function carregarOrdem() {
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome, tipo, categoria:categorias(nome), unidade_medida, validade_dias, congelado)')
      .eq('id', params.id)
      .single()

    if (data) {
      setOrdem(data)
      setLoading(false)
      // Auto-dispara a impressão após carregar
      setTimeout(() => dispararImpressao(data), 300)
    }
  }

  function dispararImpressao(ord: any) {
    const dataEntrega = new Date(ord.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')

    const html = `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Ordem de Produção - ${ord.numero_ordem}</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 80mm;
          background: white;
          font-family: Arial, sans-serif;
        }
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        .container {
          width: 80mm;
          padding: 12px;
          font-family: Arial, sans-serif;
        }
        .cabecalho {
          text-align: center;
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 2px solid black;
        }
        .cabecalho h1 {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 2px;
        }
        .cabecalho p {
          font-size: 12px;
          color: #666;
        }
        .numero-ordem {
          text-align: center;
          margin-bottom: 10px;
        }
        .numero-ordem p:first-child {
          font-size: 12px;
          color: #666;
        }
        .numero-ordem p:last-child {
          font-size: 28px;
          font-weight: bold;
        }
        .secao {
          margin-bottom: 10px;
          padding-bottom: 8px;
          border-bottom: 1px solid #ccc;
        }
        .secao label {
          font-size: 12px;
          color: #666;
          font-weight: bold;
          display: block;
        }
        .secao-dupla {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .secao-dupla > div {
          flex: 1;
        }
        .produto {
          font-size: 14px;
          font-weight: bold;
          word-break: break-word;
          margin-top: 2px;
        }
        .congelado {
          font-size: 12px;
          font-weight: bold;
          color: #0066ff;
          margin-top: 4px;
        }
        .quantidade {
          text-align: center;
        }
        .quantidade-grande {
          font-size: 32px;
          font-weight: bold;
          color: #22863a;
          margin: 4px 0;
        }
        .unidade {
          font-size: 12px;
          color: #666;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .info-label {
          color: #666;
        }
        .info-valor {
          font-weight: bold;
        }
        .observacao {
          font-size: 12px;
          word-break: break-word;
        }
        .linha-corte {
          text-align: center;
          margin: 12px 0;
          font-size: 12px;
          color: #999;
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
          <p>Ordem de Produção</p>
        </div>
        <div class="numero-ordem">
          <p>Nº ORDEM</p>
          <p>#${ord.numero_ordem}</p>
        </div>
        <div class="secao">
          <label>PRODUTO</label>
          <div class="produto">${ord.produto?.nome}</div>
          ${ord.produto?.congelado ? '<div class="congelado">❄️ CONGELADO</div>' : ''}
        </div>
        <div class="secao quantidade">
          <label>QUANTIDADE</label>
          <div class="quantidade-grande">${ord.quantidade}</div>
          <div class="unidade">${ord.produto?.unidade_medida}</div>
        </div>
        <div class="secao">
          <div class="secao-dupla">
            <div>
              <label>Categoria</label>
              <div>${ord.produto?.categoria?.nome || 'Sem categoria'}</div>
            </div>
            <div>
              <label>Tipo</label>
              <div>${ord.produto?.tipo}</div>
            </div>
          </div>
        </div>
        <div class="secao">
          <div class="info-row">
            <span class="info-label">Loja Destino:</span>
            <span class="info-valor">${LOCAL_LABEL[ord.loja_destino]}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Data Entrega:</span>
            <span class="info-valor">${dataEntrega}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Solicitado por:</span>
            <span class="info-valor">${ord.solicitado_por}</span>
          </div>
        </div>
        ${ord.observacao ? `<div class="secao">
          <label>OBS:</label>
          <div class="observacao">${ord.observacao}</div>
        </div>` : ''}
        <div class="linha-corte">✂ ✂ ✂ ✂ ✂ ✂ ✂ ✂</div>
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
    if (ordem) {
      dispararImpressao(ordem)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg mb-2">Carregando ordem...</p>
      </div>
    )
  }

  if (!ordem) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">Ordem não encontrada</p>
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
        <p className="text-sm font-semibold text-gray-700 mb-3">Ordem #{ordem.numero_ordem}</p>
        <p className="text-lg font-bold text-gray-800 mb-2">{ordem.produto?.nome}</p>
        <p className="text-sm text-gray-600">
          <strong>{ordem.quantidade}</strong> {ordem.produto?.unidade_medida}
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
