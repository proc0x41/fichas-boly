import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ProgressBar } from '../../components/ProgressBar'
import { ArrowLeft, Loader2 } from 'lucide-react'

interface RotaAdmin {
  id: string
  nome: string
  data_rota: string
  vendedor: { nome: string } | null
  total: number
  visitados: number
}

export default function AdminRotas() {
  const navigate = useNavigate()
  const [rotas, setRotas] = useState<RotaAdmin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRotas()
  }, [])

  const loadRotas = async () => {
    const { data } = await supabase
      .from('rotas')
      .select('*, vendedor:perfis!rotas_vendedor_id_fkey(nome), paradas:rota_clientes(*, visita:visitas(status))')
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
            vendedor: r.vendedor as { nome: string } | null,
            total: paradas.length,
            visitados: paradas.filter((p) => p.visita?.status === 'visitado').length,
          }
        }),
      )
    }
    setLoading(false)
  }

  return (
    <div className="px-4 pt-4">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-4 text-lg font-bold text-gray-900">Todas as Rotas</h2>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {rotas.map((rota) => (
            <div key={rota.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="font-medium text-gray-900">{rota.nome}</h4>
                <span className="text-xs text-gray-400">
                  {new Date(rota.data_rota + 'T12:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
              <p className="mb-2 text-xs text-gray-500">
                Vendedor: {(rota.vendedor as { nome: string })?.nome ?? '—'}
              </p>
              <ProgressBar current={rota.visitados} total={rota.total} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
