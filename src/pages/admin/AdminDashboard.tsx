import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Users, ClipboardList, Map, Package, Loader2 } from 'lucide-react'

interface Counts {
  vendedores: number
  clientes: number
  rotas: number
  produtos: number
}

export default function AdminDashboard() {
  const [counts, setCounts] = useState<Counts>({ vendedores: 0, clientes: 0, rotas: 0, produtos: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('perfis').select('id', { count: 'exact', head: true }).eq('role', 'vendedor'),
      supabase.from('clientes').select('id', { count: 'exact', head: true }),
      supabase.from('rotas').select('id', { count: 'exact', head: true }),
      supabase.from('produtos').select('id', { count: 'exact', head: true }),
    ]).then(([v, c, r, p]) => {
      setCounts({
        vendedores: v.count ?? 0,
        clientes: c.count ?? 0,
        rotas: r.count ?? 0,
        produtos: p.error ? 0 : (p.count ?? 0),
      })
      setLoading(false)
    })
  }, [])

  const cards = [
    { label: 'Vendedores', count: counts.vendedores, icon: Users, to: '/admin/vendedores', color: 'bg-blue-100 text-blue-600' },
    { label: 'Clientes', count: counts.clientes, icon: ClipboardList, to: '/admin/clientes', color: 'bg-green-100 text-green-600' },
    { label: 'Rotas', count: counts.rotas, icon: Map, to: '/admin/rotas', color: 'bg-purple-100 text-purple-600' },
    { label: 'Produtos', count: counts.produtos, icon: Package, to: '/admin/produtos', color: 'bg-amber-100 text-amber-700' },
  ]

  return (
    <div className="px-4 pt-4">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Painel Admin</h2>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(({ label, count, icon: Icon, to, color }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors active:bg-gray-50"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-sm text-gray-500">{label}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
