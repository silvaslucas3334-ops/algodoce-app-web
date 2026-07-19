'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import EmptyState from '@/components/EmptyState'
import ExtratoConciliacaoModal from '@/components/ExtratoConciliacaoModal'
import CategorizarReceitaModal from '@/components/CategorizarReceitaModal'
import CategorizarReceitasLoteModal from '@/components/CategorizarReceitasLoteModal'
import ConciliarGrupoModal from '@/components/ConciliarGrupoModal'
import CriarDespesasLoteModal from '@/components/CriarDespesasLoteModal'
import { importarTransacoesOFX } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { Upload, Loader, Link2, Tag, Layers, Receipt } from 'lucide-react'
import { FinanceiroExtratoTransacao, StatusConciliacao } from '@/lib/types'
import { UNIDADE_LABEL } from '@/lib/constants'

// Cada loja tem sua própria conta bancária — conta_bancaria vira literalmente
// 'loja1'/'loja2' na importação, sem precisar classificar transação por
// transação (a unidade já vem definida pelo arquivo inteiro).
const CONTAS = [
  { id: 'loja1' as const, label: UNIDADE_LABEL.loja1 },
  { id: 'loja2' as const, label: UNIDADE_LABEL.loja2 },
]

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

// Antiga /financeiro/extrato — fundida pra dentro do Fluxo de Caixa como
// aba, sem mudança de comportamento (só a casca de página/header some,
// isso quem cuida agora é o componente pai).
export default function ConciliarExtratoTab() {
  const { usuario } = useAuth()
  const [transacoes, setTransacoes] = useState<FinanceiroExtratoTransacao[]>([])
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<StatusConciliacao>('pendente')
  const [filtroConta, setFiltroConta] = useState<'todas' | 'loja1' | 'loja2'>('todas')
  const [contaImport, setContaImport] = useState<'loja1' | 'loja2'>('loja1')
  const [msgImportacao, setMsgImportacao] = useState('')
  const [erro, setErro] = useState('')
  const [modalTransacao, setModalTransacao] = useState<FinanceiroExtratoTransacao | null>(null)
  const [modalReceita, setModalReceita] = useState<FinanceiroExtratoTransacao | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [modalLote, setModalLote] = useState(false)
  const [modalGrupo, setModalGrupo] = useState(false)
  const [modalDespesasLote, setModalDespesasLote] = useState(false)

  useEffect(() => {
    carregar()
    setSelecionados(new Set())
  }, [filtroStatus, filtroConta])

  async function carregar() {
    setLoading(true)
    let query = supabase
      .from('financeiro_extrato_transacoes')
      .select('*')
      .eq('status_conciliacao', filtroStatus)
      .order('data', { ascending: false })
    if (filtroConta !== 'todas') query = query.eq('conta_bancaria', filtroConta)
    const { data, error } = await query
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
        const resultado = await importarTransacoesOFX(texto, contaImport, usuario.id)
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

  // "Selecionar todas" continua escopado só a créditos — pra conciliação em
  // grupo de débitos o usuário precisa escolher a dedo as parcelas daquele
  // contrato específico entre possivelmente vários débitos pendentes não
  // relacionados, então "selecionar tudo" não ajudaria nesse caso.
  const creditosPendentesElegiveis = transacoes.filter((t) => t.status_conciliacao === 'pendente' && t.valor > 0)
  const transacoesSelecionadas = transacoes.filter((t) => selecionados.has(t.id))
  const selecaoTodasCreditos = transacoesSelecionadas.length > 0 && transacoesSelecionadas.every((t) => t.valor > 0)
  const selecaoTodasDebitos = transacoesSelecionadas.length > 0 && transacoesSelecionadas.every((t) => t.valor < 0)
  // Compara por identidade (não só por tamanho) — senão, selecionar 1 débito
  // quando também há 1 crédito pendente faz o rótulo/toggle "achar" por
  // coincidência de contagem que os créditos já estão todos selecionados.
  const todosCreditosSelecionados =
    creditosPendentesElegiveis.length > 0 && creditosPendentesElegiveis.every((t) => selecionados.has(t.id))

  function toggleSelecionado(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarSelecionarTodos() {
    setSelecionados(todosCreditosSelecionados ? new Set() : new Set(creditosPendentesElegiveis.map((t) => t.id)))
  }

  return (
    <div>
      <div className="bg-white rounded-xl p-4 border border-gray-200 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Loja deste extrato</label>
        <div className="flex gap-2 mb-3">
          {CONTAS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setContaImport(c.id)}
              disabled={importando}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold border-2 disabled:opacity-50 ${
                contaImport === c.id ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-700'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <label className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center gap-2 text-gray-600 hover:border-pink-400 cursor-pointer">
          {importando ? <Loader size={24} className="animate-spin" /> : <Upload size={24} />}
          <span className="text-sm">{importando ? 'Importando...' : 'Selecionar arquivo .ofx'}</span>
          <input type="file" accept=".ofx,.OFX,text/plain" onChange={onArquivo} disabled={importando} className="hidden" />
        </label>
        {msgImportacao && <p className="text-sm text-green-700 mt-3">{msgImportacao}</p>}
        {erro && <p className="text-sm text-red-700 mt-3">{erro}</p>}
      </div>

      <div className="flex gap-2 mb-2 flex-wrap">
        {(['todas', ...CONTAS.map((c) => c.id)] as const).map((id) => (
          <button
            key={id}
            onClick={() => setFiltroConta(id)}
            className={`px-3 py-1 rounded-full text-sm border ${
              filtroConta === id ? 'bg-gray-800 text-white border-transparent font-semibold' : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {id === 'todas' ? 'Todas as lojas' : CONTAS.find((c) => c.id === id)!.label}
          </button>
        ))}
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

      {!loading && creditosPendentesElegiveis.length > 0 && (
        <div className="flex items-center justify-between mb-3 px-1">
          <button onClick={alternarSelecionarTodos} className="text-xs font-medium text-pink-700 hover:text-pink-800">
            {todosCreditosSelecionados
              ? 'Limpar seleção'
              : `Selecionar todas as entradas pendentes (${creditosPendentesElegiveis.length})`}
          </button>
          {selecionados.size > 0 && (
            <span className="text-xs text-gray-500">{selecionados.size} selecionada{selecionados.size > 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {selecionados.size > 0 && (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-pink-800 font-medium">
            {selecionados.size} selecionada{selecionados.size > 1 ? 's' : ''}
          </p>
          <div className="flex gap-2 items-center">
            <button onClick={() => setSelecionados(new Set())} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800">
              Cancelar
            </button>
            {selecaoTodasCreditos && (
              <button
                onClick={() => setModalLote(true)}
                className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1.5"
              >
                <Layers size={14} /> Classificar em lote
              </button>
            )}
            {selecaoTodasDebitos && (
              <>
                <button
                  onClick={() => setModalGrupo(true)}
                  className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1.5"
                >
                  <Layers size={14} /> Conciliar em grupo
                </button>
                <button
                  onClick={() => setModalDespesasLote(true)}
                  className="px-3 py-1.5 border-2 border-pink-700 text-pink-700 rounded-lg text-xs font-semibold hover:bg-pink-50 flex items-center gap-1.5"
                >
                  <Receipt size={14} /> Criar despesas em lote
                </button>
              </>
            )}
            {!selecaoTodasCreditos && !selecaoTodasDebitos && (
              <span className="text-xs text-amber-700">Selecione só entradas ou só saídas</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : transacoes.length === 0 ? (
        <EmptyState title={`Nenhuma transação ${STATUS_LABEL[filtroStatus].toLowerCase()}`} description="Importe um extrato .ofx para começar" />
      ) : (
        <div className="space-y-2">
          {transacoes.map((t) => {
            const elegivelLote = t.status_conciliacao === 'pendente'
            return (
            <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {elegivelLote && (
                  <input
                    type="checkbox"
                    checked={selecionados.has(t.id)}
                    onChange={() => toggleSelecionado(t.id)}
                    className="w-4 h-4 flex-shrink-0 accent-pink-700"
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{t.descricao_original}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                    {t.documento_extraido && <span className="ml-2 font-mono">{t.documento_extraido}</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <p className={`font-semibold ${t.valor < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatBRL(t.valor)}</p>
                {t.status_conciliacao === 'pendente' && t.valor < 0 && (
                  <button
                    onClick={() => setModalTransacao(t)}
                    className="px-3 py-1.5 bg-pink-700 text-white rounded-lg text-xs font-semibold hover:bg-pink-800 flex items-center gap-1"
                  >
                    <Link2 size={14} /> Conciliar
                  </button>
                )}
                {t.status_conciliacao === 'pendente' && t.valor > 0 && (
                  <button
                    onClick={() => setModalReceita(t)}
                    className="px-3 py-1.5 bg-green-700 text-white rounded-lg text-xs font-semibold hover:bg-green-800 flex items-center gap-1"
                  >
                    <Tag size={14} /> Categorizar
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {modalTransacao && (
        <ExtratoConciliacaoModal
          transacao={modalTransacao}
          onClose={() => setModalTransacao(null)}
          onResolvido={carregar}
        />
      )}

      {modalReceita && usuario && (
        <CategorizarReceitaModal
          transacao={modalReceita}
          unidade={modalReceita.conta_bancaria as 'loja1' | 'loja2'}
          usuarioId={usuario.id}
          onClose={() => setModalReceita(null)}
          onResolvido={carregar}
        />
      )}

      {modalLote && usuario && (
        <CategorizarReceitasLoteModal
          transacoes={transacoesSelecionadas}
          usuarioId={usuario.id}
          onClose={() => setModalLote(false)}
          onResolvido={() => {
            carregar()
            setSelecionados(new Set())
          }}
        />
      )}

      {modalGrupo && (
        <ConciliarGrupoModal
          transacoes={transacoesSelecionadas}
          onClose={() => setModalGrupo(false)}
          onResolvido={() => {
            carregar()
            setSelecionados(new Set())
          }}
        />
      )}

      {modalDespesasLote && usuario && (
        <CriarDespesasLoteModal
          transacoes={transacoesSelecionadas}
          usuarioId={usuario.id}
          onClose={() => setModalDespesasLote(false)}
          onResolvido={() => {
            carregar()
            setSelecionados(new Set())
          }}
        />
      )}
    </div>
  )
}
