import type { StatusVisita } from '../types'

const config: Record<StatusVisita, { label: string; classes: string }> = {
  pendente: { label: 'Pendente', classes: 'bg-gray-100 text-gray-600' },
  visitado: { label: 'Visitado', classes: 'bg-green-100 text-green-700' },
  nao_encontrado: { label: 'Não encontrado', classes: 'bg-red-100 text-red-700' },
  reagendado: { label: 'Reagendado', classes: 'bg-yellow-100 text-yellow-700' },
  pedido: { label: 'Pedido', classes: 'bg-blue-100 text-blue-700' },
}

export function StatusBadge({ status }: { status: StatusVisita }) {
  const { label, classes } = config[status] ?? config.pendente
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
