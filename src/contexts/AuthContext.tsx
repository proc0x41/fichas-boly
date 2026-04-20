import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { type User, type Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../types'

interface AuthState {
  user: User | null
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPerfil = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase.from('perfis').select('*').eq('user_id', userId).maybeSingle()
      if (error || !data) {
        setPerfil(null)
        return
      }
      if (!data.ativo) {
        await supabase.auth.signOut()
        setPerfil(null)
        return
      }
      const p = data as Perfil
      setPerfil({
        ...p,
        ciclo_dias: p.ciclo_dias ?? 7,
        lista_rodada_desde: p.lista_rodada_desde ?? null,
      })
    } catch {
      setPerfil(null)
    }
  }, [])

  const refreshPerfil = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (s?.user?.id) {
      await fetchPerfil(s.user.id)
    }
  }, [fetchPerfil])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.id) {
        fetchPerfil(s.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user?.id) {
        fetchPerfil(s.user.id)
      } else {
        setPerfil(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchPerfil])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { error: 'E-mail ou senha inválidos' }
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, perfil, loading, signIn, signOut, refreshPerfil }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
