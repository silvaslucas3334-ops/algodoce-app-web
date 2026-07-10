'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Loader, AlertTriangle, CheckCircle } from 'lucide-react'
import { UNIDADE_LABEL } from '@/lib/constants'
import {
  parseHistoricoItens,
  parseFinalizados,
  montarPayloadImportacao,
  detectarPeriodo,
  contarPedidosExistentes,
  substituirPeriodoPDV,
  PdvItemRaw,
  PdvPedidoRaw,
  ResultadoImportacao,
} from '@/lib/pdv-import'

interface Preview {
  pedidosRaw: PdvPedidoRaw[]
  itensRaw: PdvItemRaw[]
  periodoMin: string
  periodoMax: string
  pedidosExistentes: number
  pedidosNovos: number
  itensNovos: number
  avisos: string[]
  erros: string[]
}

function Dropzone({
  label,
  file,
  onFile,
  disabled,
}: {
  label: string
  file: File | null
  onFile: (f: File) => void
  disabled: boolean
}) {
  return (
    <label
      className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center gap-2 text-center cursor-pointer transition-colors ${
        file ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:border-pink-400'
      }`}
    >
      {file ? <CheckCircle size={22} /> : <Upload size={22} />}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs">{file ? file.name : 'Clique para selecionar o arquivo .xlsx'}</span>
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
        className="hidden"
      />
    </label>
  )
}

export default function ImportarPdvPage() {
  const { usuario } = useAuth()
  const router = useRouter()

  const [unidade, setUnidade] = useState<'loja1' | 'loja2'>('loja1')
  const [fileHistorico, setFileHistorico] = useState<File | null>(null)
  const [fileFinalizados, setFileFinalizados] = useState<File | null>(null)

  const [processando, setProcessando] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState('')

  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)

  useEffect(() => {
    setPreview(null)
    setResultado(null)
    setErro('')
    if (fileHistorico && fileFinalizados) processarArquivos()
  }, [fileHistorico, fileFinalizados, unidade])

  async function processarArquivos() {
    if (!fileHistorico || !fileFinalizados) return
    setProcessando(true)
    setErro('')
    try {
      const [itensRaw, pedidosRaw] = await Promise.all([parseHistoricoItens(fileHistorico), parseFinalizados(fileFinalizados)])
      const { pedidos, itens, avisos, erros } = montarPayloadImportacao(pedidosRaw, itensRaw)
      const { min, max } = detectarPeriodo(pedidosRaw)
      const pedidosExistentes = await contarPedidosExistentes(unidade, min, max)

      setPreview({
        pedidosRaw,
        itensRaw,
        periodoMin: min,
        periodoMax: max,
        pedidosExistentes,
        pedidosNovos: pedidos.length,
        itensNovos: itens.length,
        avisos,
        erros,
      })
    } catch (err: any) {
      console.error('Erro ao processar arquivos:', err)
      setErro('Erro ao ler os arquivos: ' + (err?.message || 'desconhecido'))
    } finally {
      setProcessando(false)
    }
  }

  async function confirmarSubstituicao() {
    if (!preview || !usuario) return
    setImportando(true)
    setErro('')
    try {
      const res = await substituirPeriodoPDV(unidade, preview.pedidosRaw, preview.itensRaw, usuario.id)
      setResultado(res)
      setPreview(null)
    } catch (err: any) {
      console.error('Erro ao importar:', err)
      setErro('Erro ao importar: ' + (err?.message || 'desconhecido'))
    } finally {
      setImportando(false)
    }
  }

  function novaImportacao() {
    setFileHistorico(null)
    setFileFinalizados(null)
    setResultado(null)
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro/pdv')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Importar Vendas do PDV</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erro}</div>}

          {resultado ? (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle size={20} /> Importação concluída
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>Período: {new Date(resultado.periodoMin + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(resultado.periodoMax + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                <p>{resultado.pedidosRemovidos} pedido(s) anterior(es) substituído(s)</p>
                <p>{resultado.pedidosInseridos} pedido(s) e {resultado.itensInseridos} item(ns) importados</p>
              </div>
              {resultado.avisos.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                  {resultado.avisos.map((a, i) => (
                    <p key={i}>⚠️ {a}</p>
                  ))}
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={novaImportacao} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50">
                  Importar outro período
                </button>
                <button onClick={() => router.push('/financeiro/pdv')} className="flex-1 px-4 py-2.5 bg-pink-700 text-white rounded-lg font-semibold hover:bg-pink-800">
                  Ver períodos importados
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Loja</label>
                  <div className="flex gap-2">
                    {(['loja1', 'loja2'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setUnidade(u)}
                        disabled={processando || importando}
                        className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 disabled:opacity-50 ${
                          unidade === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
                        }`}
                      >
                        {UNIDADE_LABEL[u]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Dropzone label="Histórico de Itens Vendidos" file={fileHistorico} onFile={setFileHistorico} disabled={processando || importando} />
                  <Dropzone label="Finalizados (Pedidos)" file={fileFinalizados} onFile={setFileFinalizados} disabled={processando || importando} />
                </div>

                {processando && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader size={16} className="animate-spin" /> Lendo arquivos...
                  </div>
                )}
              </div>

              {preview && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-4">
                  <h2 className="font-semibold text-gray-800">Confirmar importação</h2>
                  <div className="text-sm text-gray-700 space-y-1">
                    <p>
                      Período detectado: <strong>{new Date(preview.periodoMin + 'T00:00:00').toLocaleDateString('pt-BR')}</strong> a{' '}
                      <strong>{new Date(preview.periodoMax + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>
                    </p>
                    <p>{UNIDADE_LABEL[unidade]}</p>
                  </div>

                  {preview.erros.length > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={16} /> Não é possível importar:</p>
                      {preview.erros.slice(0, 10).map((e, i) => (
                        <p key={i} className="text-xs">• {e}</p>
                      ))}
                      {preview.erros.length > 10 && <p className="text-xs">... e mais {preview.erros.length - 10} erro(s).</p>}
                    </div>
                  ) : (
                    <>
                      {preview.pedidosExistentes > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                          <span>
                            Isso vai <strong>substituir {preview.pedidosExistentes} pedido(s)</strong> já importado(s) de {UNIDADE_LABEL[unidade]} nesse período.
                          </span>
                        </div>
                      )}
                      <p className="text-sm text-gray-600">
                        {preview.pedidosNovos} pedido(s) e {preview.itensNovos} item(ns) serão importados.
                      </p>
                      {preview.avisos.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                          {preview.avisos.slice(0, 5).map((a, i) => (
                            <p key={i}>⚠️ {a}</p>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={confirmarSubstituicao}
                        disabled={importando}
                        className="w-full bg-green-600 text-white rounded-lg py-3 font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {importando ? (
                          <>
                            <Loader size={18} className="animate-spin" /> Importando...
                          </>
                        ) : (
                          'Confirmar substituição'
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
