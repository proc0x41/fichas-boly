import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingButton } from '../../components/LoadingButton'
import { ArrowLeft, FileCheck, Loader2, UserCheck, UserX } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Perfil } from '../../types'

/**
 * Tela admin para gerenciar a conta única da Representada.
 *
 * Política: existe no máximo uma conta com role='representada' ativa por vez
 * (validado também na Edge Function criar-representada). Se já existe,
 * mostra status; se não, oferece criação.
 */
export default function AdminRepresentada() {
  const navigate = useNavigate()
  const [conta, setConta] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('perfis')
      .select('*')
      .eq('role', 'representada')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    setConta((data as Perfil | null) ?? null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setFormLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('criar-representada', {
      body: { email, senha, nome },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    setFormLoading(false)

    if (res.error) {
      const errData = typeof res.data === 'object' ? res.data : null
      toast.error(errData?.error || 'Erro ao criar conta da Representada')
      return
    }

    toast.success('Conta da Representada criada')
    setShowForm(false)
    setNome('')
    setEmail('')
    setSenha('')
    void load()
  }

  const toggleAtivo = async () => {
    if (!conta) return
    const { error } = await supabase
      .from('perfis')
      .update({ ativo: !conta.ativo })
      .eq('id', conta.id)
    if (error) {
      toast.error('Erro ao atualizar conta')
      return
    }
    toast.success(conta.ativo ? 'Conta desativada' : 'Conta ativada')
    void load()
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-center gap-2">
        <FileCheck className="h-5 w-5 text-primary-600" />
        <h2 className="text-lg font-bold text-gray-900">Conta da Representada</h2>
      </div>

      <p className="mb-6 text-sm text-gray-600">
        A Representada acessa apenas pedidos que os vendedores marcam como
        "Compartilhado". Lá ela emite a NF e marca o pedido como emitido.
      </p>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : conta ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900">{conta.nome}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                Criada em{' '}
                {new Date(conta.criado_em).toLocaleDateString('pt-BR')}
              </p>
              <p className="mt-2 text-xs">
                Status:{' '}
                {conta.ativo ? (
                  <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
                    Ativa
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                    Inativa
                  </span>
                )}
                {conta.must_change_password && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    Aguardando troca de senha
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void toggleAtivo()}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${
                conta.ativo
                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'
              }`}
            >
              {conta.ativo ? (
                <>
                  <UserX className="mr-1 inline h-3.5 w-3.5" />
                  Desativar
                </>
              ) : (
                <>
                  <UserCheck className="mr-1 inline h-3.5 w-3.5" />
                  Ativar
                </>
              )}
            </button>
          </div>
          <p className="mt-3 text-[11px] text-gray-400">
            Para resetar a senha: desative a conta atual e crie uma nova com o mesmo email.
            (Em uma versão futura, esse fluxo terá um botão "Resetar senha" dedicado.)
          </p>
        </div>
      ) : showForm ? (
        <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Nova conta da Representada</h3>
          <p className="text-[11px] text-gray-500">
            Será uma conta única — vários funcionários da Representada podem usar o mesmo login.
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              maxLength={100}
              placeholder="Ex: Boly Encartelados"
              className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Senha temporária</label>
            <input
              type="text"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:border-primary-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Mínimo 12 caracteres, com maiúscula, número e caractere especial. Será obrigatória a
              troca no primeiro login.
            </p>
          </div>
          <div className="flex gap-2">
            <LoadingButton type="submit" loading={formLoading} className="flex-1">
              Criar conta
            </LoadingButton>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-600"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
          <p className="mb-3 text-sm text-gray-600">Nenhuma conta da Representada cadastrada.</p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Criar conta da Representada
          </button>
        </div>
      )}
    </div>
  )
}
