'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer, AlertCircle } from 'lucide-react'
import QRCode from 'qrcode'

function NovoLoteForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { usuario } = useAuth()
  const [produtos, setProdutos] = useState<any[]>([])
  const [ordem, setOrdem] = useState<any>(null)
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null)
  const [form, setForm] = useState({
    quantidade: 0,
    peso_gramas: '',
    produzido_por: '',
  })
  const [lotes, setLotes] = useState<any[]>([])
  const [loteAtual, setLoteAtual] = useState(0)
  const [qrUrl, setQrUrl] = useState('')
  const [salvando, setSalvando] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Preencher produzido_por com nome do usuário
    if (usuario?.nome) {
      setForm(f => ({ ...f, produzido_por: usuario.nome }))
    }
  }, [usuario?.nome])

  useEffect(() => {
    if (lotes.length > 0) {
      QRCode.toDataURL(lotes[loteAtual].codigo_qr, { width: 300, margin: 1 })
        .then(url => setQrUrl(url))
    }
  }, [loteAtual, lotes])

  useEffect(() => {
    const carregarDados = async () => {
      const { data: prods } = await supabase.from('produtos').select('*').eq('ativo', true).order('nome')
      setProdutos(prods || [])

      if (params.get('ordem')) {
        const { data: ord } = await supabase.from('ordens_producao')
          .select('*, produto:produtos(*)')
          .eq('id', params.get('ordem'))
          .single()
        if (ord) {
          setOrdem(ord)
          setProdutoSelecionado(ord.produto)
          setForm(f => ({ ...f, quantidade: ord.quantidade }))

          // Registrar hora de início se ainda não tiver sido registrada
          if (!ord.hora_inicio_prod) {
            await supabase.from('ordens_producao')
              .update({ hora_inicio_prod: new Date().toISOString() })
              .eq('id', ord.id)
          }

        }
      }
    }
    carregarDados()
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!ordem || !form.produzido_por || form.quantidade <= 0) return
    setSalvando(true)

    const hoje = new Date()
    const validade = new Date(hoje)
    validade.setDate(validade.getDate() + (produtoSelecionado?.validade_dias || 0))
    const dataProducao = hoje.toISOString().split('T')[0]
    const dataValidade = validade.toISOString().split('T')[0]

    // Criar múltiplos lotes baseado na quantidade
    const quantidadeLotes = form.quantidade
    const lotesParaCriar: any[] = []
    const agora = new Date().toISOString()

    for (let i = 0; i < quantidadeLotes; i++) {
      lotesParaCriar.push({
        codigo_qr: `ALD-${Date.now()}-${i + 1}`,
        produto_id: ordem.produto_id,
        ordem_id: ordem.id,
        quantidade: 1,
        peso_gramas: produtoSelecionado?.unidade_medida === 'Gramas' ? Number(form.peso_gramas) : null,
        data_producao: dataProducao,
        data_validade: dataValidade,
        produzido_por: form.produzido_por,
        destino: ordem.loja_destino,
        status: 'na_cozinha',
        sequencia_lote: i + 1,
        total_lotes: quantidadeLotes,
        hora_inicio_prod: ordem.hora_inicio_prod || agora,
        hora_fim_prod: agora,
      })
    }

    const { data, error } = await supabase.from('lotes_producao').insert(lotesParaCriar).select('*, produto:produtos(*), ordem:ordens_producao(numero_ordem)')

    if (error) {
      console.error('Erro ao registrar lote:', error)
      alert(`Erro: ${error.message}`)
      setSalvando(false)
      return
    }

    if (data && data.length > 0) {
      await supabase.from('ordens_producao')
        .update({
          status: 'concluida',
          updated_at: new Date().toISOString()
        })
        .eq('id', ordem.id)

      setLotes(data)
      setLoteAtual(0)
      const qr = await QRCode.toDataURL(data[0].codigo_qr, { width: 300, margin: 1 })
      setQrUrl(qr)
    }
    setSalvando(false)
  }

  async function imprimir() {
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

    for (const lote of lotes) {
      const qrDataUrl = await QRCode.toDataURL(lote.codigo_qr, { width: 150, margin: 1 })
      html += `
        <div class="etiqueta">
          <div class="logo">AlgoDoce</div>
          <div class="produto">${lote.produto?.nome}</div>
          ${lote.sequencia_lote && lote.total_lotes ? `<div class="sequencia">Etq. ${lote.sequencia_lote}/${lote.total_lotes}</div>` : ''}
          <div class="qrcode">
            <img src="${qrDataUrl}" alt="QR" style="width:50mm; height:50mm;"/>
          </div>
          <div class="codigo">${lote.codigo_qr}</div>
          <div class="info">
            <p><strong>Qtd:</strong> ${lote.quantidade} ${lote.produto?.unidade_medida}</p>
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
    const printWhenReady = () => {
      const images = w.document.querySelectorAll('img')
      let loadedCount = 0
      if (images.length === 0) {
        setTimeout(() => w.print(), 300)
        return
      }
      images.forEach((img: any) => {
        if (img.complete) {
          loadedCount++
        } else {
          img.onload = () => {
            loadedCount++
            if (loadedCount === images.length) {
              setTimeout(() => w.print(), 200)
            }
          }
        }
      })
      if (loadedCount === images.length) {
        setTimeout(() => w.print(), 200)
      }
    }
    setTimeout(printWhenReady, 100)
  }

  if (lotes.length > 0) {
    const lote = lotes[loteAtual]
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 pt-4 mb-4">
          <button onClick={() => router.push('/producao')} className="text-gray-500"><ArrowLeft size={22} /></button>
          <h1 className="text-xl font-bold text-gray-800">Etiqueta Gerada</h1>
        </div>

        <div ref={printRef} className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center mb-4">
          <p className="font-bold text-lg text-pink-700">AlgoDoce</p>
          <p className="font-semibold text-gray-800 mb-1">{lote.produto?.nome}</p>
          {lote.sequencia_lote && lote.total_lotes && (
            <p className="text-sm font-medium text-amber-600 mb-3">Etiqueta {lote.sequencia_lote} de {lote.total_lotes}</p>
          )}
          {qrUrl && <img src={qrUrl} alt="QR Code" className="mx-auto mb-2" width={180} />}
          <p className="text-xs text-gray-500 font-mono mb-3">{lote.codigo_qr}</p>
          <div className="text-sm text-gray-700 space-y-0.5 text-left">
            <p><strong>Quantidade:</strong> {lote.quantidade} {lote.produto?.unidade_medida}</p>
            <p><strong>Produção:</strong> {new Date(lote.data_producao + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            <p><strong>Validade:</strong> {new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}{lote.produto?.congelado ? ' ❄️' : ''}</p>
            <p><strong>Produzido por:</strong> {lote.produzido_por}</p>
            <p><strong>Ordem:</strong> #{lote.ordem?.numero_ordem}</p>
            <p><strong>Destino:</strong> {LOCAL_LABEL[lote.destino]}</p>
            {lote.peso_gramas && <p><strong>Peso total:</strong> {lote.peso_gramas}g</p>}
          </div>
        </div>

        {lotes.length > 1 && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setLoteAtual(Math.max(0, loteAtual - 1))}
              disabled={loteAtual === 0}
              className="flex-1 bg-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              ← Anterior
            </button>
            <div className="flex-1 bg-white border border-gray-300 rounded-lg py-2 text-sm font-medium text-center text-gray-700">
              {loteAtual + 1} de {lotes.length}
            </div>
            <button
              onClick={() => setLoteAtual(Math.min(lotes.length - 1, loteAtual + 1))}
              disabled={loteAtual === lotes.length - 1}
              className="flex-1 bg-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              Próxima →
            </button>
          </div>
        )}

        <button onClick={imprimir} className="w-full bg-gray-700 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 mb-2 hover:bg-gray-800">
          <Printer size={18} /> Imprimir Etiquetas ({lotes.length})
        </button>
        <button onClick={() => router.push('/producao')} className="w-full bg-pink-700 text-white rounded-xl py-3 font-semibold">
          Ver Ordens em Produção
        </button>
      </div>
    )
  }

  const quantidadeEsperada = ordem?.quantidade || 0
  const producidoAMenos = form.quantidade > 0 && form.quantidade < quantidadeEsperada

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
        <h1 className="text-xl font-bold text-gray-800">Registrar Produção</h1>
      </div>

      {!ordem && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-blue-700">Acesse esta tela através de uma ordem de produção na aba Produção.</p>
        </div>
      )}

      {ordem && (
        <form onSubmit={salvar} className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">Ordem</p>
            <p className="font-semibold text-gray-800">{ordem.produto?.nome}</p>
            <p className="text-sm text-gray-600 mt-1">
              Pedido: {ordem.quantidade} un · {LOCAL_LABEL[ordem.loja_destino]}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              #{ordem.numero_ordem} · {new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade produzida</label>
            <input type="number" min={1} required value={form.quantidade}
              onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
            <p className="text-xs text-gray-400 mt-1">
              Validade: {produtoSelecionado?.validade_dias} dias{produtoSelecionado?.congelado ? ' ❄️' : ''}
            </p>
            {producidoAMenos && (
              <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700"><strong>Produção a menor!</strong><br/>Pedido: {quantidadeEsperada} | Produzido: {form.quantidade}</p>
              </div>
            )}
          </div>

          {produtoSelecionado?.unidade_medida === 'Gramas' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Peso total (gramas)</label>
              <input type="number" min={1} required placeholder="Ex: 3600"
                value={form.peso_gramas}
                onChange={e => setForm(f => ({ ...f, peso_gramas: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produzido por</label>
            <p className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 font-medium">
              {form.produzido_por}
            </p>
          </div>

          <button type="submit" disabled={salvando}
            className="w-full bg-gray-800 text-white rounded-xl py-3 font-semibold disabled:opacity-60">
            {salvando ? 'Registrando...' : 'Registrar Produção e Gerar Etiqueta'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function NovoLotePage() {
  return <Suspense><NovoLoteForm /></Suspense>
}
