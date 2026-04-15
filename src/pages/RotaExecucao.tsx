import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, Loader2, MapPin, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StatusVisita } from '../types'

interface Parada {
  id: string
  cliente_id: string
  ordem: number
  visita_id: string | null
  cliente: { fantasia: string; endereco: string | null; bairro: string | null; cidade: string | null }
  visita: { status: StatusVisita } | null
}

export default function RotaExecucao() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [nome, setNome] = useState('')
  const [paradas, setParadas] = useState<Parada[]>([])
  const [loading, setLoading] = useState(true)
  const [reutilizando, setReutilizando] = useState(false)

  useEffect(() => {
    if (!id) return
    loadRota()
  }, [id])

  const loadRota = async () => {
    const { data: rota } = await supabase
      .from('rotas')
      .select('nome')
      .eq('id', id)
      .single()

    if (rota) setNome(rota.nome)

    const { data } = await supabase
      .from('rota_clientes')
      .select('*, cliente:clientes(fantasia, endereco, bairro, cidade), visita:visitas(status)')
      .eq('rota_id', id)
      .order('ordem')

    if (data) setParadas(data as Parada[])
    setLoading(false)
  }

  const reutilizarRota = async () => {
    if (!user || paradas.length === 0) return
    setReutilizando(true)

    const hoje = new Date().toISOString().split('T')[0]

    const { data: novaRota, error } = await supabase
      .from('rotas')
      .insert({ vendedor_id: user.id, nome, data_rota: hoje })
      .select('id')
      .single()

    if (error || !novaRota) {
      toast.error('Erro ao reutilizar rota')
      setReutilizando(false)
      return
    }

    const novasParadas = paradas.map((p) => ({
      rota_id: novaRota.id,
      cliente_id: p.cliente_id,
      ordem: p.ordem,
    }))

    const { error: pErr } = await supabase.from('rota_clientes').insert(novasParadas)

    setReutilizando(false)

    if (pErr) {
      toast.error('Rota criada, mas erro ao copiar paradas')
    } else {
      toast.success('Rota reutilizada para hoje')
    }

    navigate(`/rotas/${novaRota.id}`, { replace: true })
  }

  const visitados = paradas.filter((p) => p.visita?.status === 'visitado').length

  const statusColor = (status?: StatusVisita) => {
    switch (status) {
      case 'visitado': return 'border-l-green-500'
      case 'nao_encontrado': return 'border-l-red-500'
      case 'reagendado': return 'border-l-yellow-500'
      default: return 'border-l-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{nome}</h2>
        <LoadingButton
          variant="secondary"
          loading={reutilizando}
          onClick={reutilizarRota}
          className="!py-2 !px-3 !text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reutilizar
        </LoadingButton>
      </div>

      <ProgressBar current={visitados} total={paradas.length} className="mt-2 mb-5" />

      {paradas.length === 0 ? (
        <EmptyState icon={<MapPin className="h-10 w-10" />} title="Nenhuma parada nesta rota" />
      ) : (
        <div className="space-y-3">
          {paradas.map((parada, idx) => (
            <Link
              key={parada.id}
              to={`/rotas/${id}/visita/${parada.cliente_id}`}
              className={`block rounded-xl border border-gray-200 border-l-4 bg-white p-4 transition-colors active:bg-gray-50 ${statusColor(parada.visita?.status as StatusVisita)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{parada.cliente.fantasia}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {[parada.cliente.endereco, parada.cliente.bairro, parada.cliente.cidade]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </div>
                <StatusBadge status={(parada.visita?.status as StatusVisita) ?? 'pendente'} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
