'use client'
import { compactoBRL, PassoGrafico } from '@/lib/financeiro-dre-apresentacao'

// Gráfico "da receita bruta ao resultado" em SVG puro (o projeto não tem biblioteca de gráficos): cada queda
// flutua entre o nível antes e depois da linha; receita em azul, quedas em rosa, resultado verde/vermelho.

const LARGURA = 600
const ALTURA = 230
const TOPO = 26
const BASE = 50 // espaço dos rótulos de baixo (inclui o valor de um resultado negativo, que desce abaixo da linha)
const LATERAL = 10

const COR = { total: '#2563eb', queda: '#fb7185', positivo: '#16a34a', negativo: '#dc2626' }

export default function DreGraficoCascata({ passos }: { passos: PassoGrafico[] }) {
  if (passos.length < 2) return null
  const niveis = passos.flatMap((p) => [p.de, p.ate, 0])
  const minimo = Math.min(...niveis)
  const maximo = Math.max(...niveis)
  const faixa = maximo - minimo || 1
  const areaAltura = ALTURA - TOPO - BASE
  const y = (v: number) => TOPO + ((maximo - v) / faixa) * areaAltura
  const fatia = (LARGURA - LATERAL * 2) / passos.length
  const larguraBarra = Math.min(54, fatia * 0.62)

  // queda: o valor SAI da receita (−); receita e resultado mostram o próprio sinal (resultado negativo = −)
  const textoValor = (p: PassoGrafico) => compactoBRL(p.tipo === 'queda' ? -p.valor : p.valor)
  const resumo = passos.map((p) => `${p.rotulo} ${textoValor(p)}`).join(', ')

  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} width="100%" role="img" aria-label={`Da receita bruta ao resultado: ${resumo}`}>
      <line x1={LATERAL} x2={LARGURA - LATERAL} y1={y(0)} y2={y(0)} stroke="#d1d5db" strokeWidth="1" />
      {passos.map((p, i) => {
        const x = LATERAL + fatia * i + (fatia - larguraBarra) / 2
        const topo = Math.min(y(p.de), y(p.ate))
        const altura = Math.max(Math.abs(y(p.de) - y(p.ate)), 2)
        const cor = p.tipo === 'total' ? COR.total : p.tipo === 'queda' ? COR.queda : p.valor >= 0 ? COR.positivo : COR.negativo
        const proximo = passos[i + 1]
        const rotulo = textoValor(p)
        const naParteDeBaixo = p.tipo === 'resultado' && p.valor < 0
        return (
          <g key={p.rotulo}>
            <rect x={x} y={topo} width={larguraBarra} height={altura} rx="3" fill={cor}>
              <title>{`${p.rotulo}: ${rotulo}`}</title>
            </rect>
            {proximo && (
              <line
                x1={x + larguraBarra}
                x2={x + fatia}
                y1={y(p.ate)}
                y2={y(p.ate)}
                stroke="#9ca3af"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
            )}
            <text
              x={x + larguraBarra / 2}
              y={naParteDeBaixo ? topo + altura + 13 : topo - 6}
              textAnchor="middle"
              fontSize="11"
              fill="#4b5563"
            >
              {rotulo}
            </text>
            <text x={x + larguraBarra / 2} y={ALTURA - 6} textAnchor="middle" fontSize="11" fill="#6b7280">
              {p.rotulo}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
