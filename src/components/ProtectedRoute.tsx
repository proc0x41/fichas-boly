import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute() {
  const { user, perfil, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (perfil?.must_change_password && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }

  // Hard role partition: representada NUNCA vê rotas de vendedor/admin e
  // vendedor/admin NUNCA cai dentro de /representada. (RLS já bloqueia os
  // dados; este guard é só pra UX — evita renderizar Layout errado.)
  if (perfil) {
    const naRotaRepresentada = location.pathname.startsWith('/representada')
    if (perfil.role === 'representada' && !naRotaRepresentada && location.pathname !== '/trocar-senha') {
      return <Navigate to="/representada" replace />
    }
    if (perfil.role !== 'representada' && naRotaRepresentada) {
      return <Navigate to="/" replace />
    }
  }

  return <Outlet />
}
