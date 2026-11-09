import { redirect } from 'next/navigation'

// Virou a aba "Por compra" do módulo Compras (/financeiro/compras).
export default function ComprasRedirect() {
  redirect('/financeiro/compras?aba=compra')
}
