import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoadingButton } from '../components/LoadingButton'
import { ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const { user, loading: authLoading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)

  if (authLoading) return null
  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, senha)
    setLoading(false)
    if (error) toast.error(error)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-600">
            <ClipboardList className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Fichas</h1>
          <p className="text-sm text-gray-500">Visita Comercial</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label htmlFor="senha" className="mb-1 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
              placeholder="••••••••••••"
            />
          </div>

          <LoadingButton type="submit" loading={loading} className="w-full">
            Entrar
          </LoadingButton>
        </form>
      </div>
    </div>
  )
}
