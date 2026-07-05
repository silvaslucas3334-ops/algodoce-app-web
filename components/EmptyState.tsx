import OluquinhasLogo from './OluquinhasLogo'

interface EmptyStateProps {
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({
  title = 'Nada aqui ainda',
  description = 'Vem aí algo especial...',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="mb-6">
        <OluquinhasLogo size="lg" />
      </div>
      <h3 className="text-xl font-semibold text-gray-700 mb-2 text-center">{title}</h3>
      <p className="text-gray-500 text-center mb-6">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-2.5 bg-pink-700 text-white rounded-lg font-medium hover:bg-pink-800 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
