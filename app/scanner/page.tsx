'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { LOCAL_LABEL } from '@/lib/constants'
import { CheckCircle, XCircle, ScanLine } from 'lucide-react'

export default function ScannerPage() {
  const { usuario } = useAuth()
  const scannerRef = useRef<any>(null)
  const elementId = 'qr-reader'
  const [resultado, setResultado] = useState<any>(null)
  const [operador, setOperador] = useState('')
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string; detalhes?: string } | null>(null)
  const [ativo, setAtivo] = useState(false)
  const [modoEnvio, setModoEnvio] = useState(false)
  const [lojaDestino, setLojaDestino] = useState('loja1')
  const [lotesEnvio, setLotesEnvio] = useState<any[]>([])
  const [acaoSelecionada, setAcaoSelecionada] = useState<'receber' | 'baixa' | null>(null)

  useEffect(() => {
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

    // COZINHA - Enviar para loja
    if (usuario?.role === 'cozinha' && lote.status === 'na_cozinha') {
      if (modoEnvio) {
        setLotesEnvio([...lotesEnvio, lote])
        setMensagem({ tipo: 'ok', texto: `✓ Adicionado ao envio`, detalhes: `${lote.produto?.nome}` })
      } else {
        setModoEnvio(true)
        setLotesEnvio([lote])
        setMensagem({ tipo: 'ok', texto: `🚀 Modo Envio Ativado`, detalhes: 'Escaneie mais etiquetas ou clique em "Confirmar Envio"' })
      }
      return
    }

    // LOJA - Mostrar opções (não automático)
    if (usuario?.role === 'loja') {
      if (lote.status === 'enviado') {
        if (lote.destino !== usuario.loja_id) {
          setMensagem({ tipo: 'erro', texto: 'Este lote é para outra loja.', detalhes: `Destino: ${LOCAL_LABEL[lote.destino]}` })
          return
        }
        setAcaoSelecionada('receber')
        setMensagem({
          tipo: 'ok',
          texto: `📦 Pendente de Recebimento`,
          detalhes: `${lote.produto?.nome} - Val: ${new Date(lote.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')}`
        })
        return
      }
      if (lote.status === 'na_loja') {
        if (lote.destino !== usuario.loja_id) {
          setMensagem({ tipo: 'erro', texto: 'Este lote é de outra loja.', detalhes: `Localização: ${LOCAL_LABEL[lote.destino]}` })
          return
        }
        setAcaoSelecionada('baixa')
        setMensagem({
          tipo: 'ok',
          texto: `📦 Etiqueta em Estoque`,
          detalhes: `${lote.produto?.nome} - ${lote.quantidade} ${lote.produto?.unidade_medida}`
        })
        return
      }
      if (lote.status === 'esgotado') {
        setMensagem({ tipo: 'erro', texto: '✗ Já foi vendido', detalhes: lote.codigo_qr })
        return
      }
    }

    setMensagem({ tipo: 'erro', texto: 'Ação não permitida para este status.', detalhes: `Status: ${lote.status}` })
  }

  async function confirmarEnvio() {
    if (lotesEnvio.length === 0) return
    for (const lote of lotesEnvio) {
      await supabase.from('lotes_producao').update({ status: 'enviado', destino: lojaDestino }).eq('id', lote.id)
      await supabase.from('movimentacoes_estoque').insert({
        lote_id: lote.id,
        tipo: 'transferencia',
        local_origem: 'cozinha',
        local_destino: lojaDestino,
        quantidade: lote.quantidade,
        registrado_por: operador,
      })
    }
    setMensagem({ tipo: 'ok', texto: `✓ Envio Confirmado`, detalhes: `${lotesEnvio.length} etiqueta(s) enviada(s) para ${LOCAL_LABEL[lojaDestino]}` })
    setModoEnvio(false)
    setLotesEnvio([])
  }

  async function confirmarRecebimento() {
    if (!resultado) return
    await supabase.from('lotes_producao').update({ status: 'na_loja' }).eq('id', resultado.id)
    await supabase.from('movimentacoes_estoque').insert({
      lote_id: resultado.id,
      tipo: 'entrada',
      local_destino: resultado.destino,
      quantidade: resultado.quantidade,
      registrado_por: operador,
    })
    setMensagem({ tipo: 'ok', texto: `✓ Recebimento Confirmado`, detalhes: `${resultado.produto?.nome}` })
    setAcaoSelecionada(null)
    setResultado(null)
  }

  async function confirmarBaixa() {
    if (!resultado) return
    await supabase.from('lotes_producao').update({ status: 'esgotado' }).eq('id', resultado.id)
    await supabase.from('movimentacoes_estoque').insert({
      lote_id: resultado.id,
      tipo: 'saida',
      local_origem: resultado.destino,
      quantidade: resultado.quantidade,
      registrado_por: operador,
    })
    setMensagem({ tipo: 'ok', texto: `✓ Baixa de Estoque Registrada`, detalhes: `${resultado.produto?.nome}` })
    setAcaoSelecionada(null)
    setResultado(null)
  }

  async function parar() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setAtivo(false)
  }

  function cancelarEnvio() {
    setModoEnvio(false)
    setLotesEnvio([])
    setMensagem(null)
  }

  useEffect(() => { return () => { parar() } }, [])

  return (
    <div className="p-4">
      <div className="pt-4 mb-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">
          <ScanLine size={22} className="text-pink-700" /> Scanner
        </h1>
        <p className="text-sm text-gray-500">{modoEnvio ? '📤 Escaneie etiquetas para enviar' : 'Aponte para o QR Code do produto'}</p>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
        <p className="text-sm font-semibold text-blue-900">👤 Operador: <strong>{operador || 'Desconhecido'}</strong></p>
        <p className="text-xs text-blue-700 mt-1">{usuario?.role === 'cozinha' ? '🏭 Cozinha' : '🏪 Loja'}</p>
      </div>

      {modoEnvio && (
        <div className="bg-amber-50 rounded-lg p-4 mb-4 border border-amber-200">
          <p className="text-sm font-semibold text-amber-900">📤 Etiquetas para enviar: <strong>{lotesEnvio.length}</strong></p>
          <div className="mt-3 space-y-2">
            {lotesEnvio.map(l => (
              <p key={l.id} className="text-xs text-amber-800">✓ {l.produto?.nome}</p>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-xs font-semibold text-amber-900 mb-2">Destino:</label>
            <select value={lojaDestino} onChange={e => setLojaDestino(e.target.value)} className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white">
              {Object.entries(LOCAL_LABEL).filter(([k]) => k !== 'cozinha').map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div id={elementId} className="rounded-xl overflow-hidden mb-4 bg-gray-100 min-h-[200px]" />

      {modoEnvio ? (
        <div className="flex gap-2">
          <button onClick={confirmarEnvio} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold">
            ✓ Confirmar Envio
          </button>
          <button onClick={cancelarEnvio} className="flex-1 bg-gray-600 text-white rounded-xl py-3 font-semibold">
            Cancelar
          </button>
        </div>
      ) : acaoSelecionada === 'receber' ? (
        <div className="flex gap-2">
          <button onClick={confirmarRecebimento} className="flex-1 bg-green-600 text-white rounded-xl py-3 font-semibold">
            ✓ Receber
          </button>
          <button onClick={() => { setAcaoSelecionada(null); setMensagem(null) }} className="flex-1 bg-gray-600 text-white rounded-xl py-3 font-semibold">
            Cancelar
          </button>
        </div>
      ) : acaoSelecionada === 'baixa' ? (
        <div className="flex gap-2">
          <button onClick={confirmarBaixa} className="flex-1 bg-red-600 text-white rounded-xl py-3 font-semibold">
            ✓ Dar Baixa
          </button>
          <button onClick={() => { setAcaoSelecionada(null); setMensagem(null) }} className="flex-1 bg-gray-600 text-white rounded-xl py-3 font-semibold">
            Cancelar
          </button>
        </div>
      ) : !ativo ? (
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
