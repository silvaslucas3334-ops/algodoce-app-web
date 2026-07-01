'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'

export default function ReimprimirPage() {
  const router = useRouter()
  const [ordens, setOrdens] = useState<any[]>([])
  const [ordenSelecionada, setOrdenSelecionada] = useState<any>(null)
  const [lotes, setLotes] = useState<any[]>([])
  const [lotesSelecionados, setLotesSelecionados] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    carregarOrdens()
  }, [])

  async function carregarOrdens() {
    setLoading(true)
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome)')
      .eq('status', 'concluida')
      .order('updated_at', { ascending: false })
      .limit(20)
    setOrdens(data || [])
    setLoading(false)
  }

  async function carregarLotes(ordemId: string) {
    const { data } = await supabase
      .from('lotes_producao')
      .select('*, ordem:ordens_producao(produto:produtos(nome, unidade_medida, congelado))')
      .eq('ordem_id', ordemId)
      .order('sequencia_lote')
    setLotes(data || [])
    setLotesSelecionados(data?.map((l: any) => l.id) || [])
  }

  function toggleLote(loteId: string) {
    setLotesSelecionados(prev =>
      prev.includes(loteId)
        ? prev.filter(id => id !== loteId)
        : [...prev, loteId]
    )
  }

  async function reimprimir() {
    if (lotesSelecionados.length === 0) {
      alert('Selecione pelo menos uma etiqueta')
      return
    }

    const lotesParaImprimir = lotes.filter(l => lotesSelecionados.includes(l.id))
    const w = window.open('', '_blank')
    if (!w) return

    let html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Etiquetas AlgoDoce - 80mm</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: "Courier New", monospace;
          width: 80mm;
          margin: 0;
          padding: 0;
          background: white;
        }
        .etiqueta {
          width: 80mm;
          padding: 4mm;
          text-align: center;
          page-break-after: always;
          border-bottom: 2px dashed #000;
          page-break-inside: avoid;
        }
        .marca-corte {
          width: 100%;
          height: 2mm;
          margin: 3mm 0;
          border-bottom: 1px dashed #999;
          font-size: 8px;
          color: #999;
          text-align: center;
          line-height: 2mm;
        }
        .logo {
          font-weight: bold;
          font-size: 14px;
          color: #000;
          margin-bottom: 2mm;
        }
        .produto {
          font-weight: 900;
          font-size: 14px;
          color: #000;
          margin-bottom: 2mm;
          word-wrap: break-word;
          line-height: 1.3;
        }
        .sequencia {
          font-size: 9px;
          color: #b93c52;
          margin-bottom: 2mm;
        }
        .qrcode {
          margin: 3mm 0;
          text-align: center;
        }
        .qrcode img {
          width: 60mm;
          height: 60mm;
        }
        .codigo {
          font-family: "Courier New", monospace;
          font-size: 9px;
          letter-spacing: 1px;
          margin-bottom: 2mm;
          word-break: break-all;
        }
        .info {
          font-size: 8px;
          text-align: left;
          line-height: 1.4;
          margin-bottom: 2mm;
        }
        .info p {
          margin: 1mm 0;
        }
        .info strong {
          font-weight: bold;
        }
        @media print {
          body { width: 80mm; margin: 0; padding: 0; }
          .etiqueta { page-break-inside: avoid; }
        }
      </style>
    </head><body>`

    for (const lote of lotesParaImprimir) {
      const qrDataUrl = await QRCode.toDataURL(lote.codigo_qr, { width: 150, margin: 1 })
      html += `
        <div class="etiqueta">
          <div class="logo">AlgoDoce</div>
          <div class="produto">${lote.ordem?.produto?.nome}</div>
          ${lote.sequencia_lote && lote.total_lotes ? `<div class="sequencia">Etq. ${lote.sequencia_lote}/${lote.total_lotes}</div>` : ''}
          <div class="qrcode">
            <img src="${qrDataUrl}" alt="QR" style="width:50mm; height:50mm;"/>
          </div>
          <div class="codigo">${lote.codigo_qr}</div>
          <div class="info">
            <p><strong>Qtd:</strong> ${lote.quantidade}</p>
            <p><strong>Prod:</strong> ${new Date(lote.data_producao + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            <p><strong>Val:</strong> ${new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}${lote.produto?.congelado ? ' ❄️' : ''}</p>
            <p><strong>Por:</strong> ${lote.produzido_por}</p>
            <p><strong>Dest:</strong> ${LOCAL_LABEL[lote.destino]}</p>
          </div>
          <div class="marca-corte">✂ CORTE</div>
        </div>
      `
    }

    html += `</body></html>`
    w.document.write(html)
    w.document.close()
    // Esperar as imagens carregarem antes de imprimir
    w.addEventListener('load', () => {
      setTimeout(() => w.print(), 200)
    })
    if (w.document.readyState === 'complete') {
      setTimeout(() => w.print(), 200)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
        <h1 className="text-xl font-bold text-gray-800">Reimprimir Etiquetas</h1>
      </div>

      {!ordenSelecionada ? (
        <div className="space-y-3">
          {ordens.length > 0 ? (
            ordens.map((ordem: any) => (
              <button
                key={ordem.id}
                onClick={() => {
                  setOrdenSelecionada(ordem)
                  carregarLotes(ordem.id)
                }}
                className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
                    <p className="text-sm text-gray-500 mt-1">{ordem.quantidade} un • {LOCAL_LABEL[ordem.loja_destino]}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ordem #{ordem.numero_ordem} • {new Date(ordem.updated_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-green-600 font-semibold text-sm">✓ Concluída</span>
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-12 text-gray-400">
              <p>Nenhuma ordem concluída disponível</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => {
              setOrdenSelecionada(null)
              setLotes([])
              setLotesSelecionados([])
            }}
            className="text-gray-600 text-sm font-medium hover:text-gray-800"
          >
            ← Voltar
          </button>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm font-semibold text-blue-900">{ordenSelecionada.produto?.nome}</p>
            <p className="text-xs text-blue-700 mt-1">Selecione as etiquetas para reimprimir</p>
          </div>

          <div className="space-y-2">
            {lotes.map((lote: any) => (
              <label key={lote.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={lotesSelecionados.includes(lote.id)}
                  onChange={() => toggleLote(lote.id)}
                  className="w-4 h-4 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{lote.codigo_qr}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Etq. {lote.sequencia_lote}/{lote.total_lotes} • Val: {new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={reimprimir}
            disabled={lotesSelecionados.length === 0}
            className="w-full bg-gray-700 text-white rounded-lg py-3 font-semibold hover:bg-gray-800 disabled:opacity-50"
          >
            🖨️ Reimprimir {lotesSelecionados.length} Etiqueta{lotesSelecionados.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}
