import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'fichas_install_dismissed'
const DISMISS_DAYS = 7

function isDismissed(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  return Date.now() - parseInt(ts) < DISMISS_DAYS * 86400000
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    setIsIOS(ios)

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isStandalone || isDismissed()) return

    if (ios) {
      setShow(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setShow(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 bg-primary-700 px-4 py-3 text-white shadow-lg">
      <Download className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {isIOS ? (
          <p className="text-xs">
            Instale o Fichas: toque em <strong>Compartilhar</strong> e depois{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
        ) : (
          <p className="text-xs">Instale o Fichas na sua tela inicial para acesso rápido.</p>
        )}
      </div>
      {!isIOS && (
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-primary-700"
        >
          Instalar
        </button>
      )}
      <button onClick={handleDismiss} className="shrink-0 p-1">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
