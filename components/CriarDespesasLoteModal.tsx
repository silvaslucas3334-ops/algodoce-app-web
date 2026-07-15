'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { criarDespesasEmLote, DespesaLoteInput } from '@/lib/financeiro-reconciliacao'
import { formatBRL } from '@/lib/ofx'
import { formatarDocumento } from '@/lib/financeiro-utils'
import { UNIDADE_LABEL } from '@/lib/constants'
import { FinanceiroExtratoTransacao, FinanceiroParte, FinanceiroConta, UnidadeFinanceiro } from '@/lib/types'
import { X, Loader, CheckCircle, AlertTriangle } from 'lucide-react'

interface Props {
  transacoes: FinanceiroExtratoTransacao[]
  usuarioId: string
  onClose: () => void
  onResolvido: () => void
}

const CONTA_BANCARIA_PARA_UNIDADE: Record<string, UnidadeFinanceiro> = { loja1: 'loja1', loja2: 'loja2' }

export default function CriarDespesasLoteModal({ transacoes, usuarioId, onClose, onResolvido }: Props) {
  const [partes, setPartes] = useState<FinanceiroParte[]>([])
  const [contas, setContas] = useState<FinanceiroConta[]>([])
  const [parteId, setParteId] = useState('')
  const [contaId, setContaId] = useState('')
  const [descricaoBase, setDescricaoBase] = useState('')
  const [unidadePorTransacao, setUnidadePorTransacao] = useState<Record<string, UnidadeFinanceiro | ''>>(() => {
    const inicial: Record<string, UnidadeFinanceiro | ''> = {}
    for (const t of transacoes) inicial[t.id] = CONTA_BANCARIA_PARA_UNIDADE[t.conta_bancaria] || ''
    return inicial
  })
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ sucesso: number; falhas: { transacaoId: string; erro: string }[] } | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase
      .from('financeiro_partes')
      .select('*')
      .eq('papel_beneficiario', true)
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPartes(data || []))
    supabase
      .from('financeiro_contas')
      .select('*')
      .in('aplicavel_a', ['despesas_gerais', 'ambos'])
      .eq('ativo', true)
      .order('codigo')
      .then(({ data }) => setContas(data || []))
  }, [])

  // Sugestão de beneficiário: só quando TODAS as transações compartilham o
  // mesmo documento extraído (null nunca conta como "compartilhado") e ele
  // bate com um cadastro. Mostrar o documento junto do nome pro admin
  // conferir, já que aqui uma sugestão errada contaminaria N despesas.
  const documentos = transacoes.map((t) => t.documento_extraido || null)
  const documentoComum = documentos.every((d) => d !== null && d === documentos[0]) ? documentos[0] : null
  const parteSugerida = documentoComum ? partes.find((p) => p.documento === documentoComum) : undefined

  useEffect(() => {
    if (parteSugerida && !parteId) setParteId(parteSugerida.id)
  }, [parteSugerida])

  const total = transacoes.reduce((acc, t) => acc + Math.abs(t.valor), 0)
  const todasUnidadesPreenchidas = transacoes.every((t) => unidadePorTransacao[t.id])
  const podeSalvar = parteId && contaId && descricaoBase.trim() && todasUnidadesPreenchidas

  async function confirmar() {
    if (!podeSalvar) {
      setErro('Preencha beneficiário, conta contábil, descrição e a unidade de cada transação.')
      return
    }
    setProcessando(true)
    setErro('')
    setProgresso(0)
    try {
      const despesas: DespesaLoteInput[] = transacoes.map((t) => ({
        transacaoId: t.id,
        valor: Math.abs(t.valor),
        data: t.data,
        unidade: unidadePorTransacao[t.id] as UnidadeFinanceiro,
      }))
      const res = await criarDespesasEmLote(despesas, parteId, contaId, descricaoBase.trim(), usuarioId, (concluidas) =>
        setProgresso(concluidas)
      )
      onResolvido()
      if (res.falhas.length === 0) {
        onClose()
      } else {
        setResultado(res)
        setProcessando(false)
      }
    } catch (err: any) {
      setErro('Erro ao criar despesas: ' + (err?.message || 'desconhecido'))
      setProcessando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Criar despesas em lote</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
        </div>

        {!resultado ? (
          <>
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <p className="font-medium text-gray-800 mb-1">{transacoes.length} transações · {formatBRL(total)}</p>
              <p className="text-xs text-gray-500">Uma despesa nova será criada e conciliada para cada transação.</p>
            </div>

            {erro && <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">{erro}</div>}

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Beneficiário</label>
                <select
                  value={parteId}
                  onChange={(e) => setParteId(e.target.value)}
                  disabled={processando}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white disabled:opacity-50"
                >
                  <option value="">Selecione...</option>
                  {partes.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
                {parteSugerida && documentoComum && (
                  <p className="text-xs text-blue-700 mt-1">
                    Sugerido porque {transacoes.length}/{transacoes.length} transações trazem {formatarDocumento(documentoComum)}, que bate com {parteSugerida.nome}.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Conta contábil</label>
                <select
                  value={contaId}
                  onChange={(e) => setContaId(e.target.value)}
                  disabled={processando}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white disabled:opacity-50"
                >
                  <option value="">Selecione...</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>{c.codigo} — {c.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Descrição base</label>
                <input
                  type="text"
                  value={descricaoBase}
                  onChange={(e) => setDescricaoBase(e.target.value)}
                  disabled={processando}
                  placeholder="Ex: Taxa de entrega"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">Cada despesa nasce como "{descricaoBase || '...'} — data".</p>
              </div>
            </div>

            <p className="text-sm font-medium text-gray-700 mb-2">Unidade de cada transação</p>
            <div className="space-y-2 mb-4">
              {transacoes
                .slice()
                .sort((a, b) => a.data.localeCompare(b.data))
                .map((t) => (
                  <div key={t.id} className="border border-gray-200 rounded-lg p-2.5">
                    <div className="flex items-center justify-between text-xs text-gray-600 mb-1.5">
                      <span className="truncate">
                        {new Date(t.data + 'T00:00:00').toLocaleDateString('pt-BR')} · {t.descricao_original}
                      </span>
                      <span className="font-semibold text-gray-800 flex-shrink-0 ml-2">{formatBRL(Math.abs(t.valor))}</span>
                    </div>
                    <div className="flex gap-1.5">
                      {(['loja1', 'loja2', 'rateio'] as UnidadeFinanceiro[]).map((u) => (
                        <button
                          key={u}
                          type="button"
                          disabled={processando}
                          onClick={() => setUnidadePorTransacao((prev) => ({ ...prev, [t.id]: u }))}
                          className={`flex-1 px-2 py-1.5 rounded text-xs font-semibold border-2 disabled:opacity-50 ${
                            unidadePorTransacao[t.id] === u ? 'border-pink-600 bg-pink-600 text-white' : 'border-gray-200 bg-white text-gray-600'
                          }`}
                        >
                          {UNIDADE_LABEL[u]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            <button
              onClick={confirmar}
              disabled={processando || !podeSalvar}
              className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processando ? (
                <>
                  <Loader size={16} className="animate-spin" /> Processando {progresso}/{transacoes.length}...
                </>
              ) : (
                <>
                  <CheckCircle size={16} /> Criar {transacoes.length} {transacoes.length === 1 ? 'despesa' : 'despesas'}
                </>
              )}
            </button>
          </>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 text-sm text-green-700">
              {resultado.sucesso} de {transacoes.length} despesas criadas com sucesso.
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              <p className="font-semibold flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14} /> {resultado.falhas.length} falharam:
              </p>
              <ul className="space-y-1 text-xs">
                {resultado.falhas.map((f) => {
                  const t = transacoes.find((x) => x.id === f.transacaoId)
                  return <li key={f.transacaoId}>{t?.descricao_original || f.transacaoId} — {f.erro}</li>
                })}
              </ul>
            </div>
            <button
              onClick={onClose}
              className="w-full border border-gray-300 text-gray-600 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Fechar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
