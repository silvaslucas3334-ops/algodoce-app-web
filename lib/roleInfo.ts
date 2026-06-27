export const ROLE_INFO = {
  admin: {
    nome: 'Administrador',
    cor: 'bg-red-100 text-red-700',
    descricao: 'Acesso completo ao sistema',
    acoes: [
      '📦 Gerenciar produtos',
      '📊 Ver relatórios',
      '👥 Gerenciar usuários',
      '👁️ Monitorar operações',
    ],
  },
  cozinha: {
    nome: 'Funcionário Cozinha',
    cor: 'bg-blue-100 text-blue-700',
    descricao: 'Gerenciar produção e estoque',
    acoes: [
      '📋 Ver ordens de produção',
      '⚙️ Registrar lotes',
      '📦 Gerenciar envios',
      '🔄 Reagendar ordens',
    ],
  },
  loja: {
    nome: 'Funcionário Loja',
    cor: 'bg-amber-100 text-amber-700',
    descricao: 'Criar ordens e gerenciar estoque local',
    acoes: [
      '📝 Criar ordens de produção',
      '📦 Ver estoque local',
      '📥 Confirmar recebimentos',
      '📤 Registrar vendas',
    ],
  },
}
