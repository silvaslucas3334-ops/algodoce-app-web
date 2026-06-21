'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { Suspense } from 'react'

function NovoLoteForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [produtos, setProdutos] = useState<any[]>([])
  const [produtoSelecionado, setProdutoSelecionado] = useState<any>(null)
  const [form, setForm] = useState({
    produto_id: params.get('produto') || '',
    quantidade: 1,
    peso_gramas: '',
    produzido_por: '',
    destino: 'loja1',
  })
  const [loteGerado, setLoteGerado] = useState<any>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [salvando, setSalvando] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('produtos').select('*').eq('ativo', true).order('nome').then(({ data }) => {
      setProdutos(data || [])
      const pid = params.get('produto') || form.produto_id
      if (pid && data) {
        const p = data.find((x: any) => x.id === pid)
        if (p) setProdutoSelecionado(p)
      }
    })
  }, [])

  function handleProduto(id: string) {
    setForm(f => ({ ...f, produto_id: id }))
    const p = produtos.find(x => x.id === id)
    setProdutoSelecionado(p || null)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.produto_id || !form.produzido_por) return
    setSalvando(true)

    const codigo = `ALD-${Date.now()}`
    const hoje = new Date()
    const validade = new Date(hoje)
    validade.setDate(validade.getDate() + (produtoSelecionado?.validade_dias || 0))

    const lote = {
      codigo_qr: codigo,
      produto_id: form.produto_id,
      ordem_id: params.get('ordem') || null,
      quantidade: form.quantidade,
      peso_gramas: produtoSelecionado?.unidade_medida === 'Gramas' ? Number(form.peso_gramas) : null,
      data_producao: hoje.toISOString().split('T')[0],
      data_validade: validade.toISOString().split('T')[0],
      produzido_por: form.produzido_por,
      destino: form.destino,
      status: 'na_cozinha',
    }

    const { data, error } = await supabase.from('lotes_producao').insert(lote).select('*, produto:produtos(*)').single()

    if (!error && data) {
      if (params.get('ordem')) {
        await supabase.from('ordens_producao').update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', params.get('ordem'))
      }
      const qr = await QRCode.toDataURL(codigo, { width: 300, margin: 1 })
      setQrDataUrl(qr)
      setLoteGerado(data)
    }
    setSalvando(false)
  }

  function imprimir() {
    const w = window.open('', '_blank')
    if (!w || !printRef.current) return
    w.document.write(`<html><head><title>Etiqueta AlgoDoce</title><style>body{font-family:Arial,sans-serif;padding:16px;max-width:320px}img{display:block;margin:0 auto}</style></head><body>${printRef.current.innerHTML}</body></html>`)
    w.document.close()
    w.print()
  }

  if (loteGerado) {
    const p = loteGerado.produto
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 pt-4 mb-6">
          <button onClick={() => router.push('/producao')} className="text-gray-500"><ArrowLeft size={22} /></button>
          <h1 className="text-xl font-bold text-gray-800">Etiqueta Gerada</h1>
        </div>
        <div ref={printRef} className="bg-white border-2 border-gray-200 rounded-xl p-4 text-center mb-4">
          <p className="font-bold text-lg text-pink-700 mb-1">AlgoDoce</p>
          <p className="font-semibold text-gray-800 mb-2">{p?.nome}</p>
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-2" width={180} />}
          <p className="text-xs text-gray-500 font-mono mb-2">{loteGerado.codigo_qr}</p>
          <div className="text-sm text-gray-700 space-y-0.5 text-left">
            <p><strong>Produção:</strong> {new Date(loteGerado.data_producao + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
            <p><strong>Validade:</strong> {new Date(loteGerado.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}{p?.congelado ? ' ❄️' : ''}</p>
            <p><strong>Produzido por:</strong> {loteGerado.produzido_por}</p>
            <p><strong>Destino:</strong> {loteGerado.destino === 'loja1' ? 'Loja 1' : loteGerado.destino === 'loja2' ? 'Loja 2' : 'Cozinha'}</p>
            {loteGerado.peso_gramas && <p><strong>Peso:</strong> {loteGerado.peso_gramas}g</p>}
            <p><strong>Qtd:</strong> {loteGerado.quantidade} {p?.unidade_medida === 'Gramas' ? 'potes' : p?.unidade_medida === 'Fatias' ? `bolos (${p?.fatias_porcoes} fatias cada)` : 'unidades'}</p>
          </div>
        </div>
        <button onClick={imprimir} className="w-full bg-gray-800 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
          <Printer size={18} /> Imprimir Etiqueta
        </button>
        <button onClick={() => { setLoteGerado(null); setQrDataUrl('') }} className="w-full mt-2 bg-pink-700 text-white rounded-xl py-3 font-semibold">
          Registrar Outro Lote
        </button>
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 pt-4 mb-6">
        <button onClick={() => router.back()} className="text-gray-500"><ArrowLeft size={22} /></button>
        <h1 className="text-xl font-bold text-gray-800">Registrar Lote</h1>
      </div>

      <form onSubmit={salvar} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
          <select
            required
            value={form.produto_id}
            onChange={e => handleProduto(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="">Selecione...</option>
            {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>

        {produtoSelecionado?.unidade_medida === 'Gramas' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Peso total (gramas)</label>
            <input
              type="number"
              min={1}
              required
              placeholder="Ex: 3600"
              value={form.peso_gramas}
              onChange={e => setForm(f => ({ ...f, peso_gramas: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade produzida</label>
          <input
            type="number"
            min={1}
            required
            value={form.quantidade}
            onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
          {produtoSelecionado && <p className="text-xs text-gray-400 mt-1">Unidade: {produtoSelecionado.unidade_medida} · Validade: {produtoSelecionado.validade_dias} dias{produtoSelecionado.congelado ? ' ❄️' : ''}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Produzido por</label>
          <input
            type="text"
            required
            placeholder="Nome do responsável"
            value={form.produzido_por}
            onChange={e => setForm(f => ({ ...f, produzido_por: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Destino</label>
          <select
            value={form.destino}
            onChange={e => setForm(f => ({ ...f, destino: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white"
          >
            <option value="loja1">Loja 1</option>
            <option value="loja2">Loja 2</option>
            <option value="cozinha">Estoque Cozinha</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={salvando}
          className="w-full bg-gray-800 text-white rounded-xl py-3 font-semibold disabled:opacity-60"
        >
          {salvando ? 'Gerando etiqueta...' : 'Registrar e Gerar Etiqueta'}
        </button>
      </form>
    </div>
  )
}

export default function NovoLotePage() {
  return <Suspense><NovoLoteForm /></Suspense>
}
