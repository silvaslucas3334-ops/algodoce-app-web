'use client'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { buscarStatusFechamento } from '@/lib/estoque-fechamento'
import FechamentoDoDiaModal from '@/components/FechamentoDoDiaModal'

const INTERVALO_MS = 60_000 // reconfere a cada minuto: pega a virada das 18h com o sistema aberto

/**
 * Bloqueio do fechamento do dia. Só vale para usuário de LOJA e só quando o admin
 * ligou o bloqueio da loja (estoque_config.bloqueio_ativo — nasce desligado).
 * Quando a loja está com o fechamento pendente, o sistema todo é substituído pelo
 * modal obrigatório; ao concluir, volta tudo ao normal.
 *
 * Regras de segurança (loja nunca trava por defeito):
 *  - admin e cozinha nunca são bloqueados;
 *  - se o banco não responde (ou o SQL da fase 4 não foi rodado) → não bloqueia;
 *  - a decisão (pendente? hora de corte?) vem do servidor, não do relógio do tablet.
 * Só em desenvolvimento: localStorage.fechamento_simular = '1' força o bloqueio
 * (pra testar a tela sem depender da hora nem da loja real).
 */
export default function FechamentoGate({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth()
  const local: string | null =
    usuario?.role === 'loja' && (usuario.loja_id === 'loja1' || usuario.loja_id === 'loja2') ? usuario.loja_id : null
  const [bloqueado, setBloqueado] = useState(false)

  const verificar = useCallback(async () => {
    if (!local) return
    if (process.env.NODE_ENV === 'development' && localStorage.getItem('fechamento_simular') === '1') {
      setBloqueado(true)
      return
    }
    const status = await buscarStatusFechamento(local)
    setBloqueado(!!status && status.bloqueio_ativo && status.pendente)
  }, [local])

  useEffect(() => {
    if (!local) {
      setBloqueado(false)
      return
    }
    verificar()
    const temporizador = setInterval(verificar, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState === 'visible') verificar() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(temporizador)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [local, verificar])

  if (local && bloqueado) {
    return (
      <FechamentoDoDiaModal
        local={local}
        obrigatorio
        onConcluido={() => {
          if (process.env.NODE_ENV === 'development') localStorage.removeItem('fechamento_simular')
          setBloqueado(false)
          verificar()
        }}
      />
    )
  }
  return <>{children}</>
}
