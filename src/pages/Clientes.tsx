import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SearchInput } from '../components/SearchInput'
import { ClienteCard } from '../components/ClienteCard'
import { EmptyState } from '../components/EmptyState'
import { Plus, Users, Loader2 } from 'lucide-react'
import type { Cliente } from '../types'

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadClientes = useCallback(async (query: string) => {
    setLoading(true)
    let q = supabase
      .from('clientes')
      .select('*, ultima_visita:visitas(data_visita)')
      .eq('ativo', true)
      .order('fantasia')

    if (query) {
      q = q.or(`fantasia.ilike.%${query}%,cnpj.ilike.%${query}%,bairro.ilike.%${query}%`)
    }

    const { data } = await q.limit(100)

    if (data) {
      setClientes(
        data.map((c: Record<string, unknown>) => {
          const visitas = c.ultima_visita as { data_visita: string }[] | null
          const ultima = visitas && visitas.length > 0
            ? visitas.sort((a, b) => b.data_visita.localeCompare(a.data_visita))[0].data_visita
            : null
          return { ...c, ultima_visita: ultima } as Cliente
        }),
      )
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadClientes(search)
  }, [search, loadClientes])

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Clientes</h2>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nome, CNPJ ou bairro..."
      />

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : clientes.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title={search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            description={search ? 'Tente outro termo de busca.' : 'Cadastre seu primeiro cliente.'}
          />
        ) : (
          clientes.map((c) => (
            <ClienteCard key={c.id} cliente={c} linkTo={`/clientes/${c.id}`} />
          ))
        )}
      </div>

      <Link
        to="/clientes/novo"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform active:scale-95"
        aria-label="Novo Cliente"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  )
}
