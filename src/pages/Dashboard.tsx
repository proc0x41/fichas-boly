import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { MapPin, Users, Plus, Loader2 } from 'lucide-react'
import type { Rota, RotaCliente } from '../types'

interface RotaComProgresso extends Rota {
  total: number
  visitados: number
}

export default function Dashboard() {
  const { perfil } = useAuth()
  const [rotas, setRotas] = useState<RotaComProgresso[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRotasDoDia()
  }, [])

  const loadRotasDoDia = async () => {
    const hoje = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('rotas')
      .select('*, paradas:rota_clientes(*, visita:visitas(status))')
      .eq('data_rota', hoje)
      .order('criado_em', { ascending: false })

    if (data) {
      setRotas(
        data.map((r: Rota & { paradas: (RotaCliente & { visita: { status: string } | null })[] }) => ({
          ...r,
          total: r.paradas?.length ?? 0,
          visitados: r.paradas?.filter((p) => p.visita?.status === 'visitado').length ?? 0,
        })),
      )
    }
    setLoading(false)
  }

  return (
    <div className="px-4 pt-4">
      <h2 className="text-lg font-bold text-gray-900">
        Olá, {perfil?.nome?.split(' ')[0] ?? 'Vendedor'}
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          to="/rotas/nova"
          className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors active:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
            <Plus className="h-5 w-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Nova Rota</span>
        </Link>
        <Link
          to="/clientes"
          className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors active:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
            <Users className="h-5 w-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Clientes</span>
        </Link>
      </div>

      <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">Rotas de Hoje</h3>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : rotas.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title="Nenhuma rota para hoje"
          description="Crie uma rota para organizar suas visitas."
          action={
            <Link
              to="/rotas/nova"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white"
            >
              Criar Rota
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {rotas.map((rota) => (
            <Link
              key={rota.id}
              to={`/rotas/${rota.id}`}
              className="block rounded-xl border border-gray-200 bg-white p-4 transition-colors active:bg-gray-50"
            >
              <div className="mb-2 flex items-center justify-between">
                <h4 className="font-medium text-gray-900">{rota.nome}</h4>
                <span className="text-xs text-gray-500">
                  {rota.visitados}/{rota.total} visitados
                </span>
              </div>
              <ProgressBar current={rota.visitados} total={rota.total} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
