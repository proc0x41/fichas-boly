import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingButton } from '../../components/LoadingButton'
import { ArrowLeft, Plus, UserCheck, UserX, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Perfil } from '../../types'

export default function AdminVendedores() {
  const navigate = useNavigate()
  const [vendedores, setVendedores] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')

  useEffect(() => {
    loadVendedores()
  }, [])

  const loadVendedores = async () => {
    const { data } = await supabase
      .from('perfis')
      .select('*')
      .eq('role', 'vendedor')
      .order('nome')

    if (data) setVendedores(data as Perfil[])
    setLoading(false)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setFormLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await supabase.functions.invoke('criar-vendedor', {
      body: { email, senha, nome },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    setFormLoading(false)

    if (res.error) {
      const errData = typeof res.data === 'object' ? res.data : null
      toast.error(errData?.error || 'Erro ao criar vendedor')
    } else {
      toast.success('Vendedor criado')
      setShowForm(false)
      setNome('')
      setEmail('')
      setSenha('')
      loadVendedores()
    }
  }

  const toggleAtivo = async (perfil: Perfil) => {
    const { error } = await supabase
      .from('perfis')
      .update({ ativo: !perfil.ativo })
      .eq('id', perfil.id)

    if (error) {
      toast.error('Erro ao atualizar vendedor')
    } else {
      toast.success(perfil.ativo ? 'Vendedor desativado' : 'Vendedor ativado')
      loadVendedores()
    }
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Vendedores</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          Novo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded-xl border border-primary-200 bg-primary-50 p-4">
          <h3 className="text-sm font-semibold text-primary-800">Novo Vendedor</h3>
          <input
            type="text"
            placeholder="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
          />
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Senha inicial (mín. 12 chars)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500">
            Senha: 12+ caracteres, 1 maiúscula, 1 número, 1 especial. O vendedor trocará no primeiro login.
          </p>
          <LoadingButton type="submit" loading={formLoading} className="w-full">
            Criar Vendedor
          </LoadingButton>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {vendedores.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{v.nome}</p>
                <p className="text-xs text-gray-400">
                  {v.ativo ? 'Ativo' : 'Inativo'}
                  {v.must_change_password && ' • Senha pendente'}
                </p>
              </div>
              <button
                onClick={() => toggleAtivo(v)}
                className={`rounded-lg p-2 ${v.ativo ? 'text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                title={v.ativo ? 'Desativar' : 'Ativar'}
              >
                {v.ativo ? <UserX className="h-5 w-5" /> : <UserCheck className="h-5 w-5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
