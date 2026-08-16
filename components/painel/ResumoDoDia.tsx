import { AlertTriangle, Clock, XCircle, Truck, TrendingUp, Package, ArrowRightLeft } from 'lucide-react'
import CardExpansivel from './CardExpansivel'
import CardContagem from './CardContagem'
import { PainelResumo } from '@/lib/painel-inicial'

interface ResumoDoDiaProps {
  resumo: PainelResumo
  papel: 'loja' | 'cozinha'
}

// Ordem dos cards é por urgência (vencimento > tarefas atrasadas >
// cancelamentos > romaneio pendente > ordens em produção > romaneio criado).
// `papel` só decide o href de 2 cards de romaneio — cada aba de /expedicao
// já nasce num lugar diferente por role (ver app/expedicao/page.tsx).
export default function ResumoDoDia({ resumo, papel }: ResumoDoDiaProps) {
  const hrefRomaneioPendente = papel === 'cozinha' ? '/expedicao?aba=devolucoes' : '/expedicao'
  const hrefRomaneioCriado = papel === 'loja' ? '/expedicao?aba=transferencias' : '/expedicao'
  const hrefOrdens = papel === 'cozinha' ? '/producao' : '/ordens'

  return (
    <div className="mb-8">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Resumo do Dia</h2>
      <div className="space-y-3">
        <CardExpansivel
          titulo="Vencimento"
          Icone={AlertTriangle}
          cor="red"
          totalBadge={resumo.venceHoje.total + resumo.vencidos.total}
          hrefVerTodos="/estoque"
          secoes={[
            {
              titulo: 'Já vencidos',
              cor: 'red',
              total: resumo.vencidos.total,
              textoVazio: 'Nenhum item vencido em estoque',
              itens: resumo.vencidos.itens.map((i) => ({ label: i.produtoNome, sublabel: `${i.quantidade} ${i.unidadeMedida}` })),
            },
            {
              titulo: 'Vence hoje',
              cor: 'amber',
              total: resumo.venceHoje.total,
              textoVazio: 'Nada vencendo hoje',
              itens: resumo.venceHoje.itens.map((i) => ({ label: i.produtoNome, sublabel: `${i.quantidade} ${i.unidadeMedida}` })),
            },
          ]}
        />

        <CardExpansivel
          titulo="Tarefas Atrasadas"
          Icone={Clock}
          cor="amber"
          totalBadge={resumo.tarefasAtrasadas.porColaborador.reduce((soma, c) => soma + c.quantidade, 0)}
          hrefVerTodos="/tarefas"
          secoes={[
            {
              cor: 'amber',
              total: resumo.tarefasAtrasadas.porColaborador.length,
              textoVazio: 'Nenhuma tarefa atrasada',
              itens: resumo.tarefasAtrasadas.porColaborador.map((c) => ({ label: c.nome, sublabel: String(c.quantidade) })),
            },
          ]}
        />

        <CardExpansivel
          titulo="Ordens Canceladas pela Produção"
          Icone={XCircle}
          cor="gray"
          totalBadge={resumo.ordensCanceladas.total}
          hrefVerTodos="/ordens"
          secoes={[
            {
              cor: 'gray',
              total: resumo.ordensCanceladas.total,
              textoVazio: 'Nenhuma ordem cancelada recentemente',
              itens: resumo.ordensCanceladas.itens.map((o) => ({ label: o.produtoNome, sublabel: o.motivo || 'Sem motivo informado' })),
            },
          ]}
        />

        <CardContagem
          valor={resumo.romaneioPendenteRecebimento}
          Icone={Truck}
          cor="text-blue-600"
          legenda="Romaneio(s) pendente(s) de recebimento"
          href={hrefRomaneioPendente}
        />

        <div className="grid grid-cols-2 gap-3">
          <CardContagem
            valor={resumo.ordensEmProducao}
            Icone={TrendingUp}
            cor="text-orange-600"
            legenda="Ordem(ns) em produção"
            href={hrefOrdens}
          />
          <CardContagem
            valor={resumo.ordensAguardandoInicio}
            Icone={Package}
            cor="text-amber-600"
            legenda="Ordem(ns) aguardando início"
            href={hrefOrdens}
          />
        </div>

        <CardContagem
          valor={resumo.romaneioCriadoParaEnvio}
          Icone={ArrowRightLeft}
          cor="text-purple-600"
          legenda="Romaneio(s) criado(s) para envio"
          href={hrefRomaneioCriado}
        />
      </div>
    </div>
  )
}
