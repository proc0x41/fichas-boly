import { useRegisterSW } from 'virtual:pwa-register/react'
import toast from 'react-hot-toast'
import { useEffect } from 'react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    if (needRefresh) {
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm">Nova versão disponível</span>
            <button
              onClick={() => {
                updateServiceWorker(true)
                toast.dismiss(t.id)
              }}
              className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white"
            >
              Atualizar
            </button>
          </div>
        ),
        { duration: Infinity },
      )
    }
  }, [needRefresh, updateServiceWorker])

  return null
}
