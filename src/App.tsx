import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Layout } from './components/Layout'
import { InstallPrompt } from './components/InstallPrompt'
import { UpdatePrompt } from './components/UpdatePrompt'
import Login from './pages/Login'
import TrocarSenha from './pages/TrocarSenha'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import ClienteForm from './pages/ClienteForm'
import ClienteDetalhe from './pages/ClienteDetalhe'
import VisitaForm from './pages/VisitaForm'
import RotasList from './pages/Rotas'
import RotaForm from './pages/RotaForm'
import RotaDetalhe from './pages/RotaDetalhe'
import RotaExecucao from './pages/RotaExecucao'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminVendedores from './pages/admin/AdminVendedores'
import AdminClientes from './pages/admin/AdminClientes'
import AdminRotas from './pages/admin/AdminRotas'
import { hasSupabaseEnv, supabaseEnvError } from './lib/supabase'

export default function App() {
  if (!hasSupabaseEnv) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-lg font-semibold text-red-700">Configuração ausente no deploy</h1>
          <p className="text-sm text-gray-700">{supabaseEnvError}</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: { fontSize: '14px' },
          }}
        />
        <InstallPrompt />
        <UpdatePrompt />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/trocar-senha" element={<TrocarSenha />} />

            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/novo" element={<ClienteForm />} />
              <Route path="/clientes/:id" element={<ClienteDetalhe />} />
              <Route path="/clientes/:id/editar" element={<ClienteForm />} />
              <Route path="/clientes/:clienteId/visita/nova" element={<VisitaForm />} />
              <Route path="/clientes/:clienteId/visita/:visitaId/editar" element={<VisitaForm />} />
              <Route path="/rotas" element={<RotasList />} />
              <Route path="/rotas/nova" element={<RotaForm />} />
              <Route path="/rotas/:id" element={<RotaDetalhe />} />
              <Route path="/rotas/:id/editar" element={<RotaForm />} />
              <Route path="/rotas/execucao/:execucaoId" element={<RotaExecucao />} />
              <Route path="/rotas/execucao/:execucaoId/visita/:clienteId" element={<VisitaForm />} />
              <Route
                path="/rotas/execucao/:execucaoId/visita/:clienteId/:visitaId/editar"
                element={<VisitaForm />}
              />

              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/vendedores" element={<AdminVendedores />} />
                <Route path="/admin/clientes" element={<AdminClientes />} />
                <Route path="/admin/rotas" element={<AdminRotas />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
