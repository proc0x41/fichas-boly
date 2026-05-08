import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

/**
 * Route guard para as telas da Representada.
 *
 * Bloqueia acesso a usuários cujo `perfil.role` não é `'representada'`.
 * Redireciona para a raiz (que por sua vez é tratada pelo ProtectedRoute /
 * Dashboard normal). Vendedores e admins que tentem entrar em
 * `/representada/...` caem aqui e são mandados embora.
 */
export function RepresentadaRoute() {
  const { perfil, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (perfil?.role !== 'representada') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
