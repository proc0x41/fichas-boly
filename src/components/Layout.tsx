import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useInactivityTimeout } from '../hooks/useInactivityTimeout'
import { Home, Users, Map, Shield, LogOut } from 'lucide-react'
import logo from '../assets/logo.jpeg'

export function Layout() {
  const { perfil, signOut } = useAuth()
  const navigate = useNavigate()

  useInactivityTimeout(true, () => navigate('/login', { replace: true }))

  const handleLogout = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/clientes', icon: Users, label: 'Clientes' },
    { to: '/rotas', icon: Map, label: 'Rotas' },
  ]

  if (perfil?.role === 'admin') {
    navItems.push({ to: '/admin', icon: Shield, label: 'Admin' })
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <img
          src={logo}
          alt="Fichas"
          className="h-9 max-h-10 w-auto object-contain object-left"
        />
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

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white safe-bottom">
        <div className="mx-auto flex max-w-lg">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                  isActive ? 'text-primary-600' : 'text-gray-400'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
