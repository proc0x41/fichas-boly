import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import { useBlocker } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'

interface Props {
  /** Há alterações não salvas no formulário atual. */
  dirty: boolean
  /**
   * Versão ref do `dirty` lida sincronamente pelo `useBlocker`. Use a ref
   * exposta por `useFormDirty` — sem ela, navegação imediata após `markSaved()`
   * ainda enxerga o `dirty` antigo (setState não foi processado).
   */
  dirtyRef?: MutableRefObject<boolean>
  /**
   * Handler de "Salvar e sair". Deve retornar `true` se o save deu certo (libera
   * a navegação) ou `false` em caso de erro (cancela a navegação e o usuário
   * permanece no form com os mesmos dados).
   */
  onSave?: () => Promise<boolean> | boolean
  message?: string
}

/**
 * Bloqueia navegação SPA (`useBlocker`) e `beforeunload` (fechar aba/refresh)
 * enquanto `dirty` for `true`. Quando o usuário tenta sair, mostra um modal com
 * três ações:
 *
 * - **Salvar e sair**: chama `onSave`; se sucesso, libera a navegação.
 * - **Sair sem salvar**: descarta as alterações e libera a navegação.
 * - **Cancelar**: continua na página, alterações intactas.
 *
 * Coloca este componente em qualquer ponto do JSX do formulário; ele renderiza
 * só o overlay quando o blocker está ativo (caso contrário retorna `null`).
 */
export function UnsavedChangesGuard({
  dirty,
  dirtyRef,
  onSave,
  message = 'Você tem alterações não salvas. O que deseja fazer?',
}: Props) {
  const isDirty = useCallback(
    () => (dirtyRef ? dirtyRef.current : dirty),
    [dirty, dirtyRef],
  )

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty() && currentLocation.pathname !== nextLocation.pathname,
  )

  // Alerta nativo do browser ao tentar fechar aba / refresh / sair do domínio.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Browsers modernos ignoram a mensagem custom — só o aviso genérico aparece.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const [saving, setSaving] = useState(false)

  const handleSaveAndLeave = async () => {
    if (!onSave) {
      blocker.proceed?.()
      return
    }
    setSaving(true)
    try {
      const ok = await onSave()
      if (ok !== false) {
        blocker.proceed?.()
      } else {
        // Save falhou — cancela a navegação para o usuário ver o erro.
        blocker.reset?.()
      }
    } finally {
      setSaving(false)
    }
  }

  if (blocker.state !== 'blocked') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Alterações não salvas</h3>
            <p className="mt-1 text-sm text-gray-600">{message}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {onSave && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveAndLeave()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar e sair
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => blocker.proceed?.()}
            className="w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Sair sem salvar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => blocker.reset?.()}
            className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
