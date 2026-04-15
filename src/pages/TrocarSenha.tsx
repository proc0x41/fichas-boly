import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { LoadingButton } from '../components/LoadingButton'
import { KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

function validatePassword(p: string): string | null {
  if (p.length < 12) return 'Mínimo de 12 caracteres'
  if (!/[A-Z]/.test(p)) return 'Deve conter ao menos 1 letra maiúscula'
  if (!/[0-9]/.test(p)) return 'Deve conter ao menos 1 número'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Deve conter ao menos 1 caractere especial'
  return null
}

export default function TrocarSenha() {
  const { perfil, user, refreshPerfil } = useAuth()
  const navigate = useNavigate()
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  if (!user) return <Navigate to="/login" replace />
  if (perfil && !perfil.must_change_password) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (novaSenha !== confirmacao) {
      setValidationError('As senhas não coincidem')
      return
    }

    const pwError = validatePassword(novaSenha)
    if (pwError) {
      setValidationError(pwError)
      return
    }

    setValidationError(null)
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('trocar-senha', {
        body: { nova_senha: novaSenha },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })

      if (res.error) {
        const msg = typeof res.data === 'object' ? res.data?.error : 'Erro ao trocar senha'
        toast.error(msg || 'Erro ao trocar senha')
      } else {
        toast.success('Senha alterada com sucesso')
        await refreshPerfil()
        navigate('/', { replace: true })
      }
    } catch {
      toast.error('Erro ao trocar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Troca de Senha Obrigatória</h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Crie uma nova senha para continuar usando o sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nova-senha" className="mb-1 block text-sm font-medium text-gray-700">
              Nova Senha
            </label>
            <input
              id="nova-senha"
              type="password"
              required
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="confirmacao" className="mb-1 block text-sm font-medium text-gray-700">
              Confirmar Nova Senha
            </label>
            <input
              id="confirmacao"
              type="password"
              required
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
            />
          </div>

          {validationError && (
            <p className="text-sm text-red-600">{validationError}</p>
          )}

          <div className="rounded-lg bg-gray-100 p-3 text-xs text-gray-600">
            <p className="mb-1 font-medium">Requisitos da senha:</p>
            <ul className="list-inside list-disc space-y-0.5">
              <li>Mínimo 12 caracteres</li>
              <li>Ao menos 1 letra maiúscula</li>
              <li>Ao menos 1 número</li>
              <li>Ao menos 1 caractere especial</li>
            </ul>
          </div>

          <LoadingButton type="submit" loading={loading} className="w-full">
            Alterar Senha
          </LoadingButton>
        </form>
      </div>
    </div>
  )
}
