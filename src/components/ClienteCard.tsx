import { Link } from 'react-router-dom'
import { Phone, MapPin } from 'lucide-react'
import { maskTelefone } from '../lib/masks'
import type { Cliente } from '../types'

interface Props {
  cliente: Cliente
  linkTo?: string
}

export function ClienteCard({ cliente, linkTo }: Props) {
  const content = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-colors active:bg-gray-50">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-gray-900">{cliente.fantasia}</h3>
          {cliente.bairro && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
              <MapPin className="h-3 w-3" />
              {cliente.bairro}{cliente.cidade ? `, ${cliente.cidade}` : ''}
            </p>
          )}
        </div>
        {!cliente.ativo && (
          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inativo</span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        {cliente.telefone && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Phone className="h-3 w-3" />
            {maskTelefone(cliente.telefone!)}
          </span>
        )}
        {cliente.ultima_visita && (
          <span className="text-xs text-gray-400">
            Última visita: {new Date(cliente.ultima_visita).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </div>
  )

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>
  }

  return content
}
