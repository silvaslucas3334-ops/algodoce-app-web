'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import ProtectedRoute from '@/components/ProtectedRoute'
import EmptyState from '@/components/EmptyState'
import ExtratoConciliacaoModal from '@/components/ExtratoConciliacaoModal'
import { importarTransacoesOFX } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Loader, Link2 } from 'lucide-react'
import { FinanceiroExtratoTransacao, StatusConciliacao } from '@/lib/types'

const STATUS_LABEL: Record<StatusConciliacao, string> = {
  pendente: 'Pendente',
  conciliado: 'Conciliado',
  ignorado: 'Ignorado',
}
const STATUS_COLOR: Record<StatusConciliacao, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  conciliado: 'bg-green-100 text-green-700',
  ignorado: 'bg-gray-100 text-gray-500',
}

export default function ExtratoPage() {
  const { usuario } = useAuth()
  const router = useRouter()
  const [transacoes, setTransacoes] = useState<FinanceiroExtratoTransacao[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<StatusConciliacao>('pendente')
  const [msgImportacao, setMsgImportacao] = useState('')
  const [erro, setErro] = useState('')
  const [modalTransacao, setModalTransacao] = useState<FinanceiroExtratoTransacao | null>(null)

  useEffect(() => {
    carregar()
  }, [filtroStatus])

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('financeiro_extrato_transacoes')
      .select('*')
      .eq('status_conciliacao', filtroStatus)
      .order('data', { ascending: false })
    if (error) console.error('Erro ao carregar extrato:', error)
    setTransacoes(data || [])
    setLoading(false)
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !usuario) return
    setErro('')
    setMsgImportacao('')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      setImportando(true)
      try {
        const texto = ev.target?.result as string
        const resultado = await importarTransacoesOFX(texto, 'principal', usuario.id)
        setMsgImportacao(`${resultado.novas} transação(ões) nova(s) importada(s), ${resultado.duplicadas} já existiam.`)
        await carregar()
      } catch (err: any) {
        console.error(err)
        setErro('Erro ao importar OFX: ' + (err?.message || 'desconhecido'))
      } finally {
        setImportando(false)
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <div className="min-h-screen bg-gray-50 pb-20">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/financeiro')} className="text-gray-500 hover:text-gray-700">
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-xl font-bold text-gray-800">Extrato Bancário</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-white rounded-xl p-4 border border-gray-200 mb-4">
            <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center gap-2 text-gray-600 hover:border-pink-400 cursor-pointer">
              {importando ? <Loader size={24} className="animate-spin" /> : <Upload size={24} />}
              <span className="text-sm">{importando ? 'Importando...' : 'Selecionar arquivo .ofx'}</span>
              <input type="file" accept=".ofx,.OFX,text/plain" onChange={onArquivo} disabled={importando} className="hidden" />
            </label>
            {msgImportacao && <p className="text-sm text-green-700 mt-3">{msgImportacao}</p>}
            {erro && <p className="text-sm text-red-700 mt-3">{erro}</p>}
          </div>

          <div className="flex gap-2 mb-4">
            {(['pendente', 'conciliado', 'ignorado'] as StatusConciliacao[]).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  filtroStatus === s ? STATUS_COLOR[s] + ' border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Carregando...</div>
          ) : transacoes.length === 0 ? (
            <EmptyState title={`Nenhuma transação ${STATUS_LABEL[filtroStatus].toLowerCase()}`} description="Importe um extrato .ofx para começar" />
          ) : (
            <div className="space-y-2">
              {transacoes.map((t) => (
                <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-800">{t.descricao_original}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                      {t.documento_extraido && <span className="ml-2 font-mono">{t.documento_extraido}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`font-semibold ${t.valor < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatBRL(t.valor)}</p>
                    {t.status_conciliacao === 'pendente' && t.valor < 0 && (
                      <button
                        onClick={() => setModalTransacao(t)}
                        className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1"
                      >
                        <Link2 size={14} /> Conciliar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalTransacao && (
          <ExtratoConciliacaoModal
            transacao={modalTransacao}
            onClose={() => setModalTransacao(null)}
            onResolvido={carregar}
          />
        )}
      </div>
    </ProtectedRoute>
  )
}
