import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { EmptyState } from '../components/EmptyState'
import { ProgressBar } from '../components/ProgressBar'
import { Plus, Map, Loader2 } from 'lucide-react'

interface RotaResumo {
  id: string
  nome: string
  data_rota: string
  total: number
  visitados: number
}

export default function RotasList() {
  const [rotas, setRotas] = useState<RotaResumo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRotas()
  }, [])

  const loadRotas = async () => {
    const { data } = await supabase
      .from('rotas')
      .select('*, paradas:rota_clientes(*, visita:visitas(status))')
      .order('data_rota', { ascending: false })
      .limit(50)

    if (data) {
      setRotas(
        data.map((r: Record<string, unknown>) => {
          const paradas = (r.paradas as { visita: { status: string } | null }[]) ?? []
          return {
            id: r.id as string,
            nome: r.nome as string,
            data_rota: r.data_rota as string,
            total: paradas.length,
            visitados: paradas.filter((p) => p.visita?.status === 'visitado').length,
          }
        }),
      )
    }
    setLoading(false)
  }

  const hoje = new Date().toISOString().split('T')[0]
  const rotasHoje = rotas.filter((r) => r.data_rota === hoje)
  const rotasFuturas = rotas.filter((r) => r.data_rota > hoje)
  const rotasAnteriores = rotas.filter((r) => r.data_rota < hoje)

  const renderGroup = (title: string, items: RotaResumo[]) =>
    items.length > 0 && (
      <div className="mb-6">
        <h3 className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</h3>
        <div className="space-y-3">
          {items.map((rota) => (
            <Link
              key={rota.id}
              to={`/rotas/${rota.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 transition-colors active:bg-gray-50"
            >
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-medium text-gray-900">{rota.nome}</h4>
                <span className="text-xs text-gray-400">
                  {new Date(rota.data_rota + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <ProgressBar current={rota.visitados} total={rota.total} />
            </Link>
          ))}
        </div>
      </div>
    )

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Rotas</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : rotas.length === 0 ? (
        <EmptyState
          icon={<Map className="h-12 w-12" />}
          title="Nenhuma rota criada"
          description="Crie uma rota para organizar suas visitas do dia."
        />
      ) : (
        <>
          {renderGroup('Hoje', rotasHoje)}
          {renderGroup('Próximas', rotasFuturas)}
          {renderGroup('Anteriores', rotasAnteriores)}
        </>
      )}

      <Link
        to="/rotas/nova"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform active:scale-95"
        aria-label="Nova Rota"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  )
}
