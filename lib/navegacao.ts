/**
 * Valida um destino de "voltar" vindo da URL (?voltarPara=...).
 *
 * Só aceita caminho interno do app (ex.: "/financeiro/despesas?status=pagas").
 * Rejeita endereço externo ("https://...", "//host", "/\host"), que dava pra
 * usar como redirecionamento aberto: um link com ?voltarPara=https://outro-site
 * mandava o usuário pra fora do sistema depois de salvar uma despesa.
 * Devolve null quando inválido — quem chama usa o destino padrão da tela.
 */
export function caminhoInternoSeguro(valor: string | null | undefined): string | null {
  if (!valor) return null
  if (!valor.startsWith('/')) return null
  if (valor.startsWith('//') || valor.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(valor)) return null
  return valor
}
