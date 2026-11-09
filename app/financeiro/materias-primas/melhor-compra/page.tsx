import { redirect } from 'next/navigation'

// Virou a aba "Melhor compra" do módulo Compras (/financeiro/compras).
export default function MelhorCompraRedirect() {
  redirect('/financeiro/compras?aba=melhor')
}
