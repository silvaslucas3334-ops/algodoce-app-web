'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { buscarOrigemDoCriador, nomeUnidade, rotuloMotivo } from '@/lib/expedicao'

// Impressão 80mm da transferência (mesmo padrão do romaneio de envio), com o MOTIVO e a origem.
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export default function ImprimirTransferenciaPage() {
  const params = useParams()
  const romaneioId = params.romaneio_id as string
  const [romaneio, setRomaneio] = useState<any>(null)
  const [origem, setOrigem] = useState<string>('Origem não registrada')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase.from('romaneios').select('*').eq('id', romaneioId).single()
      if (data) {
        const o = data.unidade_origem ?? (await buscarOrigemDoCriador(data.criado_por))
        const nome = nomeUnidade(o)
        setRomaneio(data)
        setOrigem(nome)
        setTimeout(() => imprimir(data, nome), 300)
      }
      setLoading(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [romaneioId])

  function imprimir(rom: any, origemNome: string) {
    const linhas = rom.linhas || []
    const totalEtiquetas = linhas.reduce((s: number, l: any) => s + (l.etiquetas_selecionadas?.length || 0), 0)
    const devolucao = rom.motivo === 'devolucao_saldo' || rom.motivo === 'devolucao_problema' || rom.unidade_destino === 'cozinha'
    const titulo = devolucao ? 'Devolução' : 'Transferência'
    const data = new Date(rom.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')
    const produtos = linhas
      .map(
        (l: any) => `<div class="produto"><div class="nome">${esc(l.nome_produto)} &mdash; ${esc(l.qtd_ajustada)} ${esc(l.unidade_medida)}</div>
        <div class="cont">${l.etiquetas_selecionadas?.length || 0} etiqueta(s)</div></div>`
      )
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo} - ${data}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{width:80mm;background:#fff;font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#000}
      .c{width:80mm;padding:10px}
      .cab{text-align:center;margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #000}
      .cab h1{font-size:20px;font-weight:800}.cab p{font-size:14px}
      .info{margin-bottom:8px;padding-bottom:8px;border-bottom:2px solid #000}
      .row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;gap:8px}
      .motivo{font-size:15px;font-weight:800;text-align:center;margin-bottom:8px;padding:4px;border:2px solid #000}
      .produto{margin-bottom:8px;padding-bottom:8px;border-bottom:1px dashed #000}
      .nome{font-size:15px;font-weight:800;margin-bottom:4px}.cont{font-size:13px}
      .rodape{margin-top:8px;padding-top:8px;border-top:2px solid #000;font-size:12px;font-weight:800;text-align:center}
      .ass{margin-top:18px;font-size:12px}.ass div{margin-top:22px;border-top:1px solid #000;padding-top:2px}
      @media print{body{width:80mm;margin:0;padding:0}.c{page-break-inside:avoid}}
    </style></head><body><div class="c">
      <div class="cab"><h1>AlgoDoce</h1><p>${titulo}</p></div>
      <div class="motivo">Motivo: ${esc(rotuloMotivo(rom.motivo))}</div>
      <div class="info">
        <div class="row"><span>Data:</span><span>${data}</span></div>
        <div class="row"><span>De:</span><span>${esc(origemNome)}</span></div>
        <div class="row"><span>Para:</span><span>${esc(LOCAL_LABEL[rom.unidade_destino] || rom.unidade_destino)}</span></div>
      </div>
      ${produtos}
      <div class="rodape">${linhas.length} produto(s) &middot; ${totalEtiquetas} etiqueta(s)</div>
      <div class="ass"><div>Enviado por</div><div>Recebido por</div></div>
    </div><script>window.print();</script></body></html>`

    const w = window.open()
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Carregando...</div>
  if (!romaneio) return <div className="text-center py-12 text-gray-500">Transferência não encontrada</div>

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">
          {rotuloMotivo(romaneio.motivo)} · {origem} → {LOCAL_LABEL[romaneio.unidade_destino] || romaneio.unidade_destino}
        </p>
        <p className="text-sm text-gray-600">{romaneio.linhas?.length || 0} produto(s)</p>
      </div>
      <button
        onClick={() => imprimir(romaneio, origem)}
        className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 mb-2"
      >
        <Printer size={18} /> Imprimir
      </button>
      <p className="text-xs text-gray-500 text-center">Se a janela não abriu, clique no botão. Se o pop-up foi bloqueado, permita pop-ups para este site.</p>
    </div>
  )
}
