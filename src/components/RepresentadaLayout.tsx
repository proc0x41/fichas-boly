import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useInactivityTimeout } from '../hooks/useInactivityTimeout'
import { LogOut, FileCheck } from 'lucide-react'
import logo from '../assets/logo.jpeg'

/**
 * Layout próprio da Representada — sem as tabs de vendedor.
 *
 * Top bar simples (logo + nome + sair). Sem nav inferior porque
 * a Representada só tem uma tela principal (lista de pedidos
 * compartilhados); o detalhe abre como subrota.
 */
export function RepresentadaLayout() {
  const { perfil, signOut } = useAuth()
  const navigate = useNavigate()

  useInactivityTimeout(true, () => navigate('/login', { replace: true }))

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Fichas"
            className="h-9 max-h-10 w-auto object-contain object-left"
          />
          <span className="hidden items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 sm:inline-flex">
            <FileCheck className="h-3 w-3" />
            Representada
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{perfil?.nome}</span>
          <button
            onClick={handleLogout}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Sair"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-8">
        <Outlet />
      </main>
    </div>
  )
}
