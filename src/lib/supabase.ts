import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)
export const supabaseEnvError =
  'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidas no ambiente da Vercel'

export const supabase = createClient(
  supabaseUrl ?? 'https://invalid-project.supabase.co',
  supabaseAnonKey ?? 'invalid-anon-key',
)
