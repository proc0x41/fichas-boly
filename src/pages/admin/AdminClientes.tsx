import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SearchInput } from '../../components/SearchInput'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface ClienteAdmin {
  id: string
  fantasia: string
  bairro: string | null
  cidade: string | null
  telefone: string | null
  ativo: boolean
  vendedor: { nome: string } | null
}

export default function AdminClientes() {
  const navigate = useNavigate()
  const [clientes, setClientes] = useState<ClienteAdmin[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (q: string) => {
    setLoading(true)
    let query = supabase
      .from('clientes')
      .select('id, fantasia, bairro, cidade, telefone, ativo, vendedor:perfis!clientes_vendedor_id_fkey(nome)')
      .order('fantasia')
      .limit(100)

    if (q) {
      query = query.or(`fantasia.ilike.%${q}%,cnpj.ilike.%${q}%,bairro.ilike.%${q}%`)
    }

    const { data } = await query
    if (data) setClientes(data as unknown as ClienteAdmin[])
    setLoading(false)
  }, [])

  useEffect(() => { load(search) }, [search, load])

  return (
    <div className="px-4 pt-4">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-4 text-lg font-bold text-gray-900">Todos os Clientes</h2>

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar cliente..." />

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : (
          clientes.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-gray-900">{c.fantasia}</p>
                  <p className="text-xs text-gray-500">
                    {[c.bairro, c.cidade].filter(Boolean).join(', ')}
                  </p>
                </div>
                {!c.ativo && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inativo</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>Vendedor: {(c.vendedor as unknown as { nome: string })?.nome ?? '—'}</span>
                {c.telefone && <span>{c.telefone}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
