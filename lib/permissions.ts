export type UserRole = 'admin' | 'cozinha' | 'loja'

export interface Permission {
  criarOrdens: boolean
  verOrdens: boolean
  editarOrdens: boolean
  cancelarOrdens: boolean

  verProducao: boolean
  iniciarProducao: boolean
  registrarLote: boolean
  reagendar: boolean

  verEstoqueCozinha: boolean
  criarEnvio: boolean

  verEstoqueLoja: boolean
  darBaixa: boolean
  confirmarRecebimento: boolean

  usarScanner: boolean

  acessoAdmin: boolean
  criarProdutos: boolean
  verRelatorios: boolean
  gerenciarUsuarios: boolean
}

export const PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    criarOrdens: false,
    verOrdens: true,
    editarOrdens: false,
    cancelarOrdens: false,

    verProducao: true,
    iniciarProducao: false,
    registrarLote: false,
    reagendar: false,

    verEstoqueCozinha: true,
    criarEnvio: false,

    verEstoqueLoja: true,
    darBaixa: false,
    confirmarRecebimento: false,

    usarScanner: false,

    acessoAdmin: true,
    criarProdutos: true,
    verRelatorios: true,
    gerenciarUsuarios: true,
  },

  cozinha: {
    criarOrdens: false,
    verOrdens: true,
    editarOrdens: false,
    cancelarOrdens: false,

    verProducao: true,
    iniciarProducao: true,
    registrarLote: true,
    reagendar: true,

    verEstoqueCozinha: true,
    criarEnvio: true,

    verEstoqueLoja: false,
    darBaixa: false,
    confirmarRecebimento: false,

    usarScanner: true,

    acessoAdmin: false,
    criarProdutos: false,
    verRelatorios: false,
    gerenciarUsuarios: false,
  },

  loja: {
    criarOrdens: true,
    verOrdens: true,
    editarOrdens: false,
    cancelarOrdens: false,

    verProducao: false,
    iniciarProducao: false,
    registrarLote: false,
    reagendar: false,

    verEstoqueCozinha: false,
    criarEnvio: false,

    verEstoqueLoja: true,
    darBaixa: true,
    confirmarRecebimento: true,

    usarScanner: true,

    acessoAdmin: false,
    criarProdutos: false,
    verRelatorios: false,
    gerenciarUsuarios: false,
  },
}

export function temPermissao(role: UserRole | undefined, permission: keyof Permission): boolean {
  if (!role) return false
  return PERMISSIONS[role][permission]
}
