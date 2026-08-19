/** Baixa um array de objetos como CSV — dispara o download direto no navegador. */
export function exportarCSV(dados: any[], headers: string[], filename: string): void {
  let csv = headers.join(',') + '\n'
  dados.forEach((row) => {
    const values = headers.map((h) => {
      let value = row[h] ?? ''
      if (typeof value === 'object') value = JSON.stringify(value)
      return `"${String(value).replace(/"/g, '""')}"`
    })
    csv += values.join(',') + '\n'
  })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
}
