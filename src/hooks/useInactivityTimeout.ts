import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutos

export function useInactivityTimeout(enabled: boolean, onTimeout?: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleTimeout = useCallback(async () => {
    await supabase.auth.signOut()
    onTimeout?.()
  }, [onTimeout])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(handleTimeout, TIMEOUT_MS)
  }, [handleTimeout])

  useEffect(() => {
    if (!enabled) return

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, resetTimer])
}
