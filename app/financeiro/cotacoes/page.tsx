import { redirect } from 'next/navigation'

// A lista de cotações virou uma aba do módulo Compras. O endereço antigo continua
// valendo (links, favoritos) e leva direto pra aba.
export default function CotacoesRedirect() {
  redirect('/financeiro/compras?aba=cotacoes')
}
