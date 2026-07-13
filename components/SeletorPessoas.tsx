'use client'

interface GrupoPessoas {
  label: string
  pessoas: { id: string; nome: string }[]
}

interface SeletorPessoasProps {
  grupos: GrupoPessoas[]
  selecionados: string[]
  multi?: boolean
  onChange: (ids: string[]) => void
}

// Substitui o <select> nativo por uma lista de botões sempre visíveis (sem
// precisar abrir um dropdown e rolar) — usuários estavam deixando a pessoa
// pré-selecionada do <select> sem perceber que precisavam trocar.
export default function SeletorPessoas({ grupos, selecionados, multi = false, onChange }: SeletorPessoasProps) {
  function toggle(id: string) {
    if (multi) {
      onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id])
    } else {
      onChange([id])
    }
  }

  return (
    <div className="space-y-3">
      {grupos.map(
        (g) =>
          g.pessoas.length > 0 && (
            <div key={g.label}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.label}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {g.pessoas.map((p) => {
                  const ativo = selecionados.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`w-full flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm text-left transition-all ${
                        ativo
                          ? 'border-pink-600 bg-pink-50 text-pink-800 font-semibold'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 flex-shrink-0 border-2 ${multi ? 'rounded' : 'rounded-full'} ${
                          ativo ? 'border-pink-600 bg-pink-600' : 'border-gray-300'
                        }`}
                      />
                      {p.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )
      )}
    </div>
  )
}
