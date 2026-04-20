import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, Loader2, MapPin, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StatusVisita } from '../types'

interface Parada {
  cliente_id: string
  ordem: number
  cliente: { fantasia: string; endereco: string | null; bairro: string | null; cidade: string | null }
  visita: { id: string; status: StatusVisita } | null
}

export default function RotaExecucao() {
  const { execucaoId } = useParams()
  const navigate = useNavigate()
  const [nome, setNome] = useState('')
  const [rotaId, setRotaId] = useState<string | null>(null)
  const [paradas, setParadas] = useState<Parada[]>([])
  const [loading, setLoading] = useState(true)
  const [finalizando, setFinalizando] = useState(false)
  const [finalizada, setFinalizada] = useState(false)

  useEffect(() => {
    if (!execucaoId) return
    loadExecucao()
  }, [execucaoId])

  const loadExecucao = async () => {
    setLoading(true)

    const { data: exec } = await supabase
      .from('rota_execucoes')
      .select('id, finalizada_em, rota:rotas(id, nome)')
      .eq('id', execucaoId)
      .single()

    if (!exec) {
      setLoading(false)
      return
    }

    const rota = exec.rota as unknown as { id: string; nome: string } | null
    setNome(rota?.nome ?? '')
    setRotaId(rota?.id ?? null)
    setFinalizada(Boolean(exec.finalizada_em))

    if (!rota?.id) {
      setLoading(false)
      return
    }

    const [{ data: paradasTemplate }, { data: visitasExec }] = await Promise.all([
      supabase
        .from('rota_clientes')
        .select('cliente_id, ordem, cliente:clientes(fantasia, endereco, bairro, cidade)')
        .eq('rota_id', rota.id)
        .order('ordem'),
      supabase
        .from('visitas')
        .select('id, cliente_id, status')
        .eq('rota_execucao_id', execucaoId),
    ])

    const visitasPorCliente = new Map<string, { id: string; status: StatusVisita }>()
    ;(visitasExec ?? []).forEach((v) => {
      visitasPorCliente.set(v.cliente_id, { id: v.id, status: v.status as StatusVisita })
    })

    setParadas(
      ((paradasTemplate ?? []) as unknown as Parada[]).map((p) => ({
        ...p,
        visita: visitasPorCliente.get(p.cliente_id) ?? null,
      })),
    )
    setLoading(false)
  }

  const finalizarExecucao = async () => {
    if (!execucaoId) return
    if (!confirm('Finalizar esta execução? Visitas pendentes ficarão como estão.')) return
    setFinalizando(true)
    const { error } = await supabase
      .from('rota_execucoes')
      .update({ finalizada_em: new Date().toISOString() })
      .eq('id', execucaoId)
    setFinalizando(false)
    if (error) {
      toast.error('Erro ao finalizar')
      return
    }
    toast.success('Rota finalizada')
    setFinalizada(true)
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
      <button
        onClick={() => (rotaId ? navigate(`/rotas/${rotaId}`) : navigate(-1))}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-gray-900">{nome}</h2>
          {finalizada && (
            <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              Finalizada
            </span>
          )}
        </div>
        {!finalizada && paradas.length > 0 && (
          <LoadingButton
            variant="secondary"
            loading={finalizando}
            onClick={finalizarExecucao}
            className="!py-2 !px-3 !text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            Finalizar
          </LoadingButton>
        )}
      </div>

      <ProgressBar current={visitados} total={paradas.length} className="mt-3 mb-5" />

      {paradas.length === 0 ? (
        <EmptyState icon={<MapPin className="h-10 w-10" />} title="Nenhuma parada nesta rota" />
      ) : (
        <div className="space-y-3">
          {paradas.map((parada, idx) => (
            <Link
              key={parada.cliente_id}
              to={
                parada.visita
                  ? `/rotas/execucao/${execucaoId}/visita/${parada.cliente_id}/${parada.visita.id}/editar`
                  : `/rotas/execucao/${execucaoId}/visita/${parada.cliente_id}`
              }
              className={`block rounded-xl border border-gray-200 border-l-4 bg-white p-4 transition-colors active:bg-gray-50 ${statusColor(parada.visita?.status)}`}
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
                <StatusBadge status={parada.visita?.status ?? 'pendente'} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
