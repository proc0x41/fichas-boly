import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    errorMessage: '',
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro fatal na aplicação:', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const missingEnv =
      !import.meta.env.VITE_SUPABASE_URL ||
      !import.meta.env.VITE_SUPABASE_ANON_KEY ||
      this.state.errorMessage.includes('VITE_SUPABASE_URL')

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="mb-2 text-lg font-semibold text-red-700">Falha ao iniciar a aplicação</h1>
          {missingEnv ? (
            <div className="space-y-2 text-sm text-gray-700">
              <p>As variáveis de ambiente da Vercel não estão configuradas corretamente.</p>
              <p>Defina no projeto da Vercel:</p>
              <ul className="list-disc pl-5">
                <li>VITE_SUPABASE_URL</li>
                <li>VITE_SUPABASE_ANON_KEY</li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-700">Ocorreu um erro inesperado. Recarregue a página.</p>
          )}
        </div>
      </div>
    )
  }
}
