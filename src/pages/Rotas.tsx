import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { ProgressBar } from '../components/ProgressBar'
import {
  Plus,
  Map,
  Loader2,
  GripVertical,
  Play,
  ChevronRight,
  Check,
  Circle,
  CheckCircle2,
  AlertCircle,
  ArrowDownUp,
  ListOrdered,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  CICLO_DIAS_DEFAULT,
  calcularStatusCiclo,
  descreverStatus,
  ordenarPorPendencia,
  type RotaCicloStatus,
} from '../lib/ciclo'

interface RotaTemplate {
  id: string
  nome: string
  ordem: number
  total_clientes: number
  status: RotaCicloStatus
}

function SortableRotaCard({
  rota,
  cicloDias,
  onNavigate,
  reorderMode,
}: {
  rota: RotaTemplate
  cicloDias: number
  onNavigate: () => void
  reorderMode: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rota.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const { status } = rota
  const descricao = descreverStatus(status, cicloDias)
  const atrasada =
    !status.modoListaRodada && !status.feita && (status.diasDesdeUltima ?? Infinity) > cicloDias

  const StatusIcon = status.temExecucaoAtiva
    ? Play
    : status.feita
      ? CheckCircle2
      : atrasada
        ? AlertCircle
        : Circle

  const statusColor = status.temExecucaoAtiva
    ? 'text-blue-500'
    : status.feita
      ? 'text-green-500'
      : atrasada
        ? 'text-red-500'
        : 'text-gray-300'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border bg-white p-4 ${
        status.feita ? 'border-gray-200' : 'border-gray-200'
      }`}
    >
      {reorderMode ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-gray-400"
          aria-label="Reordenar"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <StatusIcon className={`h-7 w-7 ${statusColor}`} aria-hidden />
        </div>
      )}

      <button
        onClick={onNavigate}
        disabled={reorderMode}
        className="flex min-w-0 flex-1 items-center justify-between text-left disabled:cursor-not-allowed"
      >
        <div className="min-w-0">
          <p
            className={`truncate font-medium ${
              status.feita && !status.temExecucaoAtiva ? 'text-gray-500' : 'text-gray-900'
            }`}
          >
            {rota.nome}
          </p>
          <p
            className={`mt-0.5 text-xs ${
              atrasada ? 'text-red-500' : status.temExecucaoAtiva ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            {descricao} · {rota.total_clientes}{' '}
            {rota.total_clientes === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
        {!reorderMode && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>
    </div>
  )
}

type ModoOrdem = 'manual' | 'pendencia'

export default function RotasList() {
  const navigate = useNavigate()
  const { user, perfil, refreshPerfil } = useAuth()
  const cicloDias = perfil?.ciclo_dias ?? CICLO_DIAS_DEFAULT
  const listaRodadaDesde = perfil?.lista_rodada_desde ?? null

  const [rotas, setRotas] = useState<RotaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [reorderMode, setReorderMode] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [modoOrdem, setModoOrdem] = useState<ModoOrdem>('manual')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const loadRotas = useCallback(async (listaRodadaParam?: string | null) => {
    const listaEfetivo = listaRodadaParam !== undefined ? listaRodadaParam : listaRodadaDesde
    setLoading(true)
    const { data } = await supabase
      .from('rotas')
      .select(
        '*, paradas:rota_clientes(id), execucoes:rota_execucoes(id, iniciada_em, finalizada_em)',
      )
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('criado_em', { ascending: false })

    if (data) {
      setRotas(
        data.map((r: Record<string, unknown>) => {
          const paradas = (r.paradas as { id: string }[]) ?? []
          const execucoes =
            (r.execucoes as {
              id: string
              iniciada_em: string
              finalizada_em: string | null
            }[]) ?? []
          return {
            id: r.id as string,
            nome: r.nome as string,
            ordem: (r.ordem as number) ?? 0,
            total_clientes: paradas.length,
            status: calcularStatusCiclo(execucoes, cicloDias, new Date(), listaEfetivo),
          }
        }),
      )
    }
    setLoading(false)
  }, [cicloDias, listaRodadaDesde])

  useEffect(() => {
    void loadRotas()
  }, [loadRotas])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setRotas((items) => {
        const oldIdx = items.findIndex((i) => i.id === active.id)
        const newIdx = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIdx, newIdx)
      })
    }
  }

  const salvarOrdem = async () => {
    setSavingOrder(true)
    const updates = rotas.map((r, idx) =>
      supabase.from('rotas').update({ ordem: idx }).eq('id', r.id),
    )
    const results = await Promise.all(updates)
    const erro = results.find((r) => r.error)
    setSavingOrder(false)
    if (erro) {
      toast.error('Erro ao salvar a ordem')
    } else {
      toast.success('Ordem salva')
      setReorderMode(false)
      loadRotas()
    }
  }

  const rotasParaExibir = useMemo(() => {
    if (reorderMode || modoOrdem === 'manual') return rotas
    return ordenarPorPendencia(rotas)
  }, [rotas, modoOrdem, reorderMode])

  const feitas = rotas.filter((r) => r.status.feita && !r.status.temExecucaoAtiva).length
  const ativas = rotas.filter((r) => r.status.temExecucaoAtiva).length
  const total = rotas.length
  const rodadaCompleta =
    Boolean(listaRodadaDesde) && total > 0 && feitas + ativas === total && ativas === 0

  const iniciarNovaRodada = async () => {
    if (!user?.id) return
    const iso = new Date().toISOString()
    const { error } = await supabase.from('perfis').update({ lista_rodada_desde: iso }).eq('user_id', user.id)
    if (error) {
      toast.error('Não foi possível iniciar uma nova rodada')
      return
    }
    await refreshPerfil()
    await loadRotas(iso)
    toast.success('Nova rodada iniciada — checklist zerada.')
  }

  return (
    <div className="px-4 pt-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Rotas</h2>
        {rotas.length > 1 && !loading && (
          reorderMode ? (
            <button
              onClick={salvarOrdem}
              disabled={savingOrder}
              className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {savingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar ordem
            </button>
          ) : (
            <button
              onClick={() => setReorderMode(true)}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
            >
              Reordenar
            </button>
          )
        )}
      </div>

      {!loading && total > 0 && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {listaRodadaDesde ? 'Checklist da rodada' : `Ciclo de ${cicloDias} dias`}
            </p>
            <p className="text-xs text-gray-400">
              {feitas}
              {ativas > 0 && ` + ${ativas} ativa${ativas > 1 ? 's' : ''}`} de {total}
            </p>
          </div>
          <ProgressBar current={feitas + ativas} total={total} />
          {rodadaCompleta && (
            <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
              Rodada concluída. Toque em Nova rodada para recomeçar do zero.
            </p>
          )}
          {!reorderMode && user && (
            <button
              type="button"
              onClick={iniciarNovaRodada}
              className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Nova rodada — recomeçar checklist
            </button>
          )}
          {!reorderMode && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setModoOrdem('manual')}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  modoOrdem === 'manual'
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-gray-50 text-gray-500'
                }`}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                Ordem manual
              </button>
              <button
                onClick={() => setModoOrdem('pendencia')}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  modoOrdem === 'pendencia'
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-gray-50 text-gray-500'
                }`}
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
                Pendentes primeiro
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : rotas.length === 0 ? (
        <EmptyState
          icon={<Map className="h-12 w-12" />}
          title="Nenhuma rota criada"
          description="Crie uma rota (agrupamento de clientes) para usar no dia a dia."
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={rotasParaExibir.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {rotasParaExibir.map((rota) => (
                <SortableRotaCard
                  key={rota.id}
                  rota={rota}
                  cicloDias={cicloDias}
                  reorderMode={reorderMode}
                  onNavigate={() => navigate(`/rotas/${rota.id}`)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {!reorderMode && (
        <Link
          to="/rotas/nova"
          className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform active:scale-95"
          aria-label="Nova Rota"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}
    </div>
  )
}
