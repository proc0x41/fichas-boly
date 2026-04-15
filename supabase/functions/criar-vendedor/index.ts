import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function validatePassword(password: string): string | null {
  if (password.length < 12) return 'Senha deve ter no mínimo 12 caracteres'
  if (!/[A-Z]/.test(password)) return 'Senha deve conter ao menos 1 letra maiúscula'
  if (!/[0-9]/.test(password)) return 'Senha deve conter ao menos 1 número'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Senha deve conter ao menos 1 caractere especial'
  return null
}

function sanitize(value: string | undefined): string {
  if (!value) return ''
  return value.replace(/<[^>]*>/g, '').trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('perfis')
      .select('role, ativo')
      .eq('user_id', user.id)
      .single()

    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.ativo) {
      return new Response(JSON.stringify({ error: 'Acesso restrito a administradores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, senha, nome } = await req.json()

    if (!email || !senha || !nome) {
      return new Response(JSON.stringify({ error: 'Email, senha e nome são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const passwordError = validatePassword(senha)
    if (passwordError) {
      return new Response(JSON.stringify({ error: passwordError }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: senha,
      email_confirm: true,
    })

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: profileError } = await supabaseAdmin.from('perfis').insert({
      user_id: newUser.user.id,
      nome: sanitize(nome),
      role: 'vendedor',
      must_change_password: true,
      ativo: true,
    })

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      return new Response(JSON.stringify({ error: 'Erro ao criar perfil do vendedor' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await supabaseAdmin.from('audit_log').insert({
      user_id: user.id,
      acao: 'vendedor_criado',
      tabela: 'perfis',
      registro_id: newUser.user.id,
      payload: { email: email.trim().toLowerCase(), nome: sanitize(nome) },
    })

    return new Response(
      JSON.stringify({ id: newUser.user.id, email: newUser.user.email }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
