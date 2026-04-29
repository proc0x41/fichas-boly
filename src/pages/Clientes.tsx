import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SearchInput } from '../components/SearchInput'
import { ClienteCard } from '../components/ClienteCard'
import { EmptyState } from '../components/EmptyState'
import { PaginationBar } from '../components/PaginationBar'
import { Plus, Users, Loader2 } from 'lucide-react'
import type { Cliente } from '../types'

const PAGE_SIZE = 25

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [search])

  const loadClientes = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase
      .from('clientes')
      .select('*, ultima_visita:visitas(data_visita)', { count: 'exact' })
      .eq('ativo', true)
      .order('fantasia')
      .range(from, to)

    if (search.trim()) {
      // PostgREST .or() trata vírgulas e parênteses como separadores; remover do termo de busca
      const query = search.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ')
      const digits = query.replace(/\D/g, '')
      const fields = [
        'fantasia',
        'razao_social',
        'cnpj',
        'inscricao_estadual',
        'endereco',
        'bairro',
        'cidade',
        'estado',
        'cep',
        'comprador',
        'telefone',
        'email',
      ]
      const conditions = fields.map((f) => `${f}.ilike.%${query}%`)
      // Se o termo tem dígitos, busca também por cnpj/cep/telefone só pelos dígitos (mascarados ou não)
      if (digits && digits !== query) {
        conditions.push(`cnpj.ilike.%${digits}%`)
        conditions.push(`cep.ilike.%${digits}%`)
        conditions.push(`telefone.ilike.%${digits}%`)
      }
      q = q.or(conditions.join(','))
    }

    const { data, count, error } = await q

    if (error) {
      setClientes([])
      setTotal(0)
    } else if (data) {
      setClientes(
        data.map((c: Record<string, unknown>) => {
          const visitas = c.ultima_visita as { data_visita: string }[] | null
          const ultima =
            visitas && visitas.length > 0
              ? visitas.sort((a, b) => b.data_visita.localeCompare(a.data_visita))[0].data_visita
              : null
          return { ...c, ultima_visita: ultima } as Cliente
        }),
      )
      setTotal(count ?? 0)
      if (data.length === 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1))
      }
    }
    setLoading(false)
  }, [search, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadClientes()
  }, [loadClientes])

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Clientes</h2>
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nome, razão social, CNPJ, endereço, comprador..."
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
          <>
            {clientes.map((c) => (
              <ClienteCard key={c.id} cliente={c} linkTo={`/clientes/${c.id}`} />
            ))}
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </>
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
