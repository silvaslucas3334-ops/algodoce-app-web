'use client'
import { AlertTriangle } from 'lucide-react'
import { formatBRL } from '@/lib/ofx'
import {
  AjusteEstado,
  AnaliseDiferenca,
  motivosDisponiveis,
  Resolucao,
  TOLERANCIA_DIFERENCA,
} from '@/lib/conciliacao-diferenca'

interface Props {
  analise: AnaliseDiferenca
  estado: AjusteEstado
  onChange: (estado: AjusteEstado) => void
  /** Quando há mais de uma despesa selecionada: em qual delas aplicar o ajuste. */
  alvos?: { id: string; rotulo: string }[]
  /** id único para os campos (vários formulários podem aparecer na mesma tela) */
  idBase: string
}

// Diferença acima da tolerância entre o que o banco debitou e o que as despesas somam: o usuário
// escolhe o que aconteceu (alterar o valor da despesa, registrar como juros/taxa ou pagamento parcial),
// diz o motivo, e isso fica gravado na despesa. Nada é aceito em silêncio.
export default function AjusteDiferencaForm({ analise, estado, onChange, alvos, idBase }: Props) {
  if (!analise.exigeResolucao) return null

  const maisQueDespesa = analise.diferenca > 0
  const valor = formatBRL(analise.absoluta)
  const motivos = motivosDisponiveis(estado.resolucao, analise.diferenca)
  const motivoEscolhido = motivos.find((m) => m.id === estado.motivoId)
  const precisaMotivo = estado.resolucao === 'ajustar_valor' || estado.resolucao === 'juros_taxa'

  function escolher(r: Resolucao) {
    // trocar de resolução invalida o motivo anterior (as listas são diferentes)
    onChange({ ...estado, resolucao: r, motivoId: '', motivoTexto: '' })
  }

  const rotulos: Record<Resolucao, { titulo: string; ajuda: string }> = {
    ajustar_valor: {
      titulo: maisQueDespesa
        ? `Alterar o valor da despesa para o valor pago (+${valor})`
        : `Alterar o valor da despesa para o valor pago (−${valor})`,
      ajuda: maisQueDespesa
        ? 'Ex.: item a mais no pedido, frete. O valor da despesa passa a ser o que saiu do banco.'
        : 'Ex.: faltou item, cancelaram algo, desconto. O valor da despesa passa a ser o que saiu do banco.',
    },
    juros_taxa: {
      titulo: `Registrar a diferença (+${valor}) como juros, multa ou taxa`,
      ajuda: 'O valor da despesa sobe e a diferença fica marcada como juros/multa/taxa.',
    },
    parcial: {
      titulo: `Pagamento parcial — a despesa continua em aberto (faltam ${valor})`,
      ajuda: 'Use quando o banco debitou só uma parte e o restante ainda será pago.',
    },
  }

  return (
    <div
      className={`rounded-lg border p-3 space-y-2.5 text-sm ${maisQueDespesa ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-200'}`}
      role="group"
      aria-label="Diferença entre o banco e a despesa"
    >
      <div>
        <p className="font-semibold text-gray-800">
          Diferença de {valor} — {maisQueDespesa ? 'o banco pagou a mais' : 'o banco pagou a menos'}
        </p>
        <p className="text-xs text-gray-600">
          Até {formatBRL(TOLERANCIA_DIFERENCA)} passa direto. Acima disso, escolha o que aconteceu e informe o motivo:
        </p>
      </div>

      <div className="space-y-1.5">
        {analise.opcoes.map((r) => (
          <label
            key={r}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 cursor-pointer ${
              estado.resolucao === r ? 'border-pink-500 bg-white' : 'border-transparent bg-white/60 hover:bg-white'
            }`}
          >
            <input
              type="radio"
              name={`resolucao-${idBase}`}
              checked={estado.resolucao === r}
              onChange={() => escolher(r)}
              className="mt-0.5 accent-pink-700"
            />
            <span>
              <span className="block font-medium text-gray-800">{rotulos[r].titulo}</span>
              <span className="block text-xs text-gray-500">{rotulos[r].ajuda}</span>
            </span>
          </label>
        ))}
      </div>

      {precisaMotivo && (
        <div className="space-y-1.5">
          {alvos && alvos.length > 1 && (
            <div>
              <label htmlFor={`alvo-${idBase}`} className="block text-xs font-medium text-gray-600 mb-1">
                Aplicar em qual despesa
              </label>
              <select
                id={`alvo-${idBase}`}
                value={estado.alvoId}
                onChange={(e) => onChange({ ...estado, alvoId: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
              >
                {alvos.map((a) => (
                  <option key={a.id} value={a.id}>{a.rotulo}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`motivo-${idBase}`} className="block text-xs font-medium text-gray-600 mb-1">
              Motivo (obrigatório)
            </label>
            <select
              id={`motivo-${idBase}`}
              value={estado.motivoId}
              onChange={(e) => onChange({ ...estado, motivoId: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Selecione…</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          {motivoEscolhido && (
            <input
              type="text"
              value={estado.motivoTexto}
              onChange={(e) => onChange({ ...estado, motivoTexto: e.target.value })}
              placeholder={motivoEscolhido.exigeTexto ? 'Descreva o motivo' : 'Detalhe (opcional)'}
              aria-label="Detalhe do motivo"
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          )}
          <p className="text-[11px] text-gray-500">O motivo e a mudança de valor ficam registrados nas observações e no histórico da despesa.</p>
        </div>
      )}

      {analise.muitoGrande && (
        <label className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-2.5 py-2 text-xs text-red-800 cursor-pointer">
          <input
            type="checkbox"
            checked={estado.confirmaGrande}
            onChange={(e) => onChange({ ...estado, confirmaGrande: e.target.checked })}
            className="mt-0.5 accent-red-700"
          />
          <span>
            <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
            Diferença muito grande. Confirmo que {valor} é real e que não marquei uma despesa a mais por engano.
          </span>
        </label>
      )}
    </div>
  )
}
