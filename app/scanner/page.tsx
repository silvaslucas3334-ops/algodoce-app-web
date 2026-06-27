'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { CheckCircle, XCircle, ScanLine } from 'lucide-react'

export default function ScannerPage() {
  const { usuario } = useAuth()
  const scannerRef = useRef<any>(null)
  const elementId = 'qr-reader'
  const [resultado, setResultado] = useState<any>(null)
  const [operador, setOperador] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string; detalhes?: string } | null>(null)
  const [ativo, setAtivo] = useState(false)

  useEffect(() => {
    // Preencher operador com nome do usuário
    if (usuario?.nome) {
      setOperador(usuario.nome)
    }
  }, [usuario?.nome])

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

    // Identificar ação baseado no status
    if (lote.status === 'enviado') {
      // Recebimento - etiqueta foi enviada da cozinha para a loja
      await supabase.from('lotes_producao').update({ status: 'na_loja' }).eq('id', lote.id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: lote.id,
        tipo: 'entrada',
        local_destino: lote.destino,
        quantidade: lote.quantidade,
        registrado_por: operador,
      })
      setMensagem({ tipo: 'ok', texto: `✓ Recebimento Confirmado`, detalhes: `${lote.produto?.nome} - Val: ${new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}` })
    } else if (lote.status === 'na_loja') {
      // Baixa de estoque - etiqueta está na loja e será vendida
      await supabase.from('lotes_producao').update({ status: 'esgotado' }).eq('id', lote.id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: lote.id,
        tipo: 'saida',
        local_origem: lote.destino,
        quantidade: lote.quantidade,
        registrado_por: operador,
      })
      setMensagem({ tipo: 'ok', texto: `✓ Baixa de Estoque Registrada`, detalhes: `${lote.produto?.nome} - ${lote.quantidade} ${lote.produto?.unidade_medida}` })
    } else if (lote.status === 'esgotado') {
      setMensagem({ tipo: 'erro', texto: 'Este lote já foi vendido.', detalhes: lote.codigo_qr })
    } else if (lote.status === 'na_cozinha') {
      setMensagem({ tipo: 'erro', texto: 'Este lote ainda está na cozinha.', detalhes: 'Aguarde o envio para a loja.' })
    } else {
      setMensagem({ tipo: 'erro', texto: `Status inválido: ${lote.status}` })
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

      <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
        <p className="text-sm font-semibold text-blue-900">👤 Operador: <strong>{operador || 'Desconhecido'}</strong></p>
        <p className="text-xs text-blue-700 mt-1">O sistema detectará automaticamente a ação necessária</p>
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
          <div className="flex-1">
            <p className={`font-semibold ${mensagem.tipo === 'ok' ? 'text-green-700' : 'text-red-600'}`}>{mensagem.texto}</p>
            {mensagem.detalhes && (
              <p className="text-sm text-gray-600 mt-2">{mensagem.detalhes}</p>
            )}
            {resultado && (
              <p className="text-xs text-gray-500 mt-2">
                {resultado.codigo_qr}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
