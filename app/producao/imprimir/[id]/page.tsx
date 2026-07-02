'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LOCAL_LABEL } from '@/lib/constants'
import { useParams } from 'next/navigation'

export default function ImprimirOrdemPage() {
  const params = useParams()
  const [ordem, setOrdem] = useState<any>(null)

  useEffect(() => {
    carregarOrdem()
    window.print()
  }, [params.id])

  async function carregarOrdem() {
    const { data } = await supabase
      .from('ordens_producao')
      .select('*, produto:produtos(nome, tipo, categoria:categorias(nome), unidade_medida, validade_dias, congelado)')
      .eq('id', params.id)
      .single()

    if (data) setOrdem(data)
  }

  if (!ordem) {
    return <div className="text-center py-12 text-gray-400">Carregando...</div>
  }

  const dataEntrega = new Date(ordem.data_entrega + 'T00:00:00').toLocaleDateString('pt-BR')

  return (
    <div style={{ width: '80mm', margin: '0 auto', padding: '16px', fontFamily: 'Arial, sans-serif' }}>
      <style>{`
        body {
          margin: 0;
          padding: 0;
          width: 80mm;
          background: white;
        }
        * {
          margin: 0;
          padding: 0;
        }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ textAlign: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid black' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>AlgoDoce</h1>
        <p style={{ fontSize: '12px', color: '#666' }}>Ordem de Produção</p>
      </div>

      {/* Número da ordem */}
      <div style={{ textAlign: 'center', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', color: '#666' }}>Nº ORDEM</p>
        <p style={{ fontSize: '28px', fontWeight: 'bold' }}>#{ordem.numero_ordem}</p>
      </div>

      {/* Produto - destaque */}
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #ccc' }}>
        <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>PRODUTO</p>
        <p style={{ fontSize: '14px', fontWeight: 'bold', wordBreak: 'break-word' }}>{ordem.produto?.nome}</p>
        {ordem.produto?.congelado && (
          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#0066ff', marginTop: '4px' }}>❄️ CONGELADO</p>
        )}
      </div>

      {/* Quantidade - grande */}
      <div style={{ textAlign: 'center', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #ccc' }}>
        <p style={{ fontSize: '12px', color: '#666' }}>QUANTIDADE</p>
        <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#22863a' }}>{ordem.quantidade}</p>
        <p style={{ fontSize: '12px', color: '#666' }}>{ordem.produto?.unidade_medida}</p>
      </div>

      {/* Categoria e Tipo */}
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #ccc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <div>
            <p style={{ color: '#666' }}>Categoria</p>
            <p style={{ fontWeight: 'bold' }}>{ordem.produto?.categoria?.nome || 'Sem categoria'}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#666' }}>Tipo</p>
            <p style={{ fontWeight: 'bold' }}>{ordem.produto?.tipo}</p>
          </div>
        </div>
      </div>

      {/* Informações */}
      <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #ccc', fontSize: '12px', lineHeight: '1.5' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Loja Destino:</span>
          <span style={{ fontWeight: 'bold' }}>{LOCAL_LABEL[ordem.loja_destino]}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Data Entrega:</span>
          <span style={{ fontWeight: 'bold' }}>{dataEntrega}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Solicitado por:</span>
          <span style={{ fontWeight: 'bold' }}>{ordem.solicitado_por}</span>
        </div>
      </div>

      {/* Observações */}
      {ordem.observacao && (
        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #ccc' }}>
          <p style={{ fontSize: '12px', color: '#666', fontWeight: 'bold' }}>OBS:</p>
          <p style={{ fontSize: '12px', wordBreak: 'break-word' }}>{ordem.observacao}</p>
        </div>
      )}

      {/* Linha de corte */}
      <div style={{ textAlign: 'center', margin: '16px 0' }}>
        <p style={{ fontSize: '12px', color: '#999' }}>✂ ✂ ✂ ✂ ✂ ✂ ✂ ✂</p>
      </div>
    </div>
  )
}
