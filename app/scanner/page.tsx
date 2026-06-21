'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CheckCircle, XCircle, ScanLine } from 'lucide-react'

type Acao = 'entrada' | 'saida'

export default function ScannerPage() {
  const scannerRef = useRef<any>(null)
  const elementId = 'qr-reader'
  const [resultado, setResultado] = useState<any>(null)
  const [acao, setAcao] = useState<Acao>('entrada')
  const [operador, setOperador] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [ativo, setAtivo] = useState(false)

  async function iniciarScanner() {
    if (!operador) { setMensagem({ tipo: 'erro', texto: 'Informe seu nome antes de escanear.' }); return }
    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(elementId)
    scannerRef.current = scanner
    setAtivo(true)
    setMensagem(null)
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (codigo: string) => {
        await scanner.stop()
        setAtivo(false)
        await processarCodigo(codigo)
      },
      () => {}
    )
  }

  async function processarCodigo(codigo: string) {
    const { data: lote, error } = await supabase
      .from('lotes_producao')
      .select('*, produto:produtos(nome, unidade_medida)')
      .eq('codigo_qr', codigo)
      .single()

    if (error || !lote) {
      setMensagem({ tipo: 'erro', texto: 'QR Code não encontrado no sistema.' })
      return
    }

    setResultado(lote)

    if (acao === 'entrada') {
      await supabase.from('lotes_producao').update({ status: 'na_loja' }).eq('id', lote.id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: lote.id,
        tipo: 'entrada',
        local_destino: lote.destino,
        quantidade: lote.quantidade,
        registrado_por: operador,
      })
      setMensagem({ tipo: 'ok', texto: `Entrada registrada: ${lote.produto?.nome}` })
    } else {
      if (lote.status === 'esgotado') {
        setMensagem({ tipo: 'erro', texto: 'Este lote já está esgotado.' })
        return
      }
      await supabase.from('lotes_producao').update({ status: 'esgotado' }).eq('id', lote.id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: lote.id,
        tipo: 'saida',
        local_origem: lote.destino,
        quantidade: lote.quantidade,
        registrado_por: operador,
      })
      setMensagem({ tipo: 'ok', texto: `Saída registrada: ${lote.produto?.nome}` })
    }
  }

  async function parar() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setAtivo(false)
  }

  useEffect(() => { return () => { parar() } }, [])

  return (
    <div className="p-4">
      <div className="pt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
          <ScanLine size={22} className="text-pink-700" /> Scanner
        </h1>
        <p className="text-sm text-gray-500">Aponte para o QR Code do produto</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Seu nome</label>
        <input
          type="text"
          placeholder="Quem está registrando?"
          value={operador}
          onChange={e => setOperador(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm"
        />
      </div>

      <div className="flex gap-2 mb-4">
        {(['entrada', 'saida'] as Acao[]).map(a => (
          <button
            key={a}
            onClick={() => setAcao(a)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border ${acao === a ? (a === 'entrada' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600') : 'bg-white border-gray-200 text-gray-600'}`}
          >
            {a === 'entrada' ? '📥 Entrada na loja' : '📤 Saída (venda)'}
          </button>
        ))}
      </div>

      <div id={elementId} className="rounded-xl overflow-hidden mb-4 bg-gray-100 min-h-[200px]" />

      {!ativo ? (
        <button onClick={iniciarScanner} className="w-full bg-pink-700 text-white rounded-xl py-3 font-semibold">
          Iniciar Scanner
        </button>
      ) : (
        <button onClick={parar} className="w-full bg-gray-600 text-white rounded-xl py-3 font-semibold">
          Parar
        </button>
      )}

      {mensagem && (
        <div className={`mt-4 p-4 rounded-xl flex items-start gap-3 ${mensagem.tipo === 'ok' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          {mensagem.tipo === 'ok' ? <CheckCircle className="text-green-600 mt-0.5" size={20} /> : <XCircle className="text-red-500 mt-0.5" size={20} />}
          <div>
            <p className={`font-semibold ${mensagem.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{mensagem.texto}</p>
            {resultado && (
              <p className="text-sm text-gray-500 mt-1">
                Validade: {new Date(resultado.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')} · {resultado.codigo_qr}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
