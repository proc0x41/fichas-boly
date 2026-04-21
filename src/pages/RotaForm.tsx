import { useState, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { SearchInput } from '../components/SearchInput'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, GripVertical, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Cliente } from '../types'

interface ClienteItem {
  id: string
  fantasia: string
  bairro: string | null
}

function SortableCliente({
  item,
  index,
  onRemove,
}: {
  item: ClienteItem
  index: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3"
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-gray-400">
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800">{item.fantasia}</p>
        {item.bairro && <p className="text-xs text-gray-400">{item.bairro}</p>}
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function RotaForm() {
  const navigate = useNavigate()
  const { id: rotaId } = useParams()
  const isEditing = Boolean(rotaId)
  const { user } = useAuth()
  const [nome, setNome] = useState('')
  const [clientesSelecionados, setClientesSelecionados] = useState<ClienteItem[]>([])
  const [searchResults, setSearchResults] = useState<Cliente[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(isEditing)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    if (!isEditing || !rotaId) return
    ;(async () => {
      const [{ data: rota }, { data: paradas }] = await Promise.all([
        supabase.from('rotas').select('nome').eq('id', rotaId).single(),
        supabase
          .from('rota_clientes')
          .select('cliente_id, ordem, cliente:clientes(id, fantasia, bairro)')
          .eq('rota_id', rotaId)
          .order('ordem'),
      ])
      if (rota) setNome(rota.nome)
      if (paradas) {
        setClientesSelecionados(
          (paradas as unknown as {
            cliente: { id: string; fantasia: string; bairro: string | null } | null
          }[])
            .filter((p) => p.cliente)
            .map((p) => ({
              id: p.cliente!.id,
              fantasia: p.cliente!.fantasia,
              bairro: p.cliente!.bairro,
            })),
        )
      }
      setLoadingData(false)
    })()
  }, [isEditing, rotaId])

  const SEARCH_PAGE = 30

  const searchClientes = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      setSearchHasMore(false)
      return
    }
    const { data } = await supabase
      .from('clientes')
      .select('id, fantasia, bairro')
      .eq('ativo', true)
      .ilike('fantasia', `%${query}%`)
      .order('fantasia')
      .range(0, SEARCH_PAGE - 1)

    const list = (data ?? []) as Cliente[]
    setSearchResults(list)
    setSearchHasMore(list.length === SEARCH_PAGE)
  }, [])

  const loadMoreSearchClientes = async () => {
    if (!searchQuery.trim()) return
    const from = searchResults.length
    const to = from + SEARCH_PAGE - 1
    const { data } = await supabase
      .from('clientes')
      .select('id, fantasia, bairro')
      .eq('ativo', true)
      .ilike('fantasia', `%${searchQuery}%`)
      .order('fantasia')
      .range(from, to)
    const next = (data ?? []) as Cliente[]
    setSearchResults((prev) => {
      const ids = new Set(prev.map((p) => p.id))
      return [...prev, ...next.filter((c) => !ids.has(c.id))]
    })
    setSearchHasMore(next.length === SEARCH_PAGE)
  }

  const addCliente = (c: Cliente) => {
    if (clientesSelecionados.some((s) => s.id === c.id)) return
    setClientesSelecionados((prev) => [
      ...prev,
      { id: c.id, fantasia: c.fantasia, bairro: c.bairro },
    ])
    setSearchQuery('')
    setSearchResults([])
  }

  const removeCliente = (id: string) => {
    setClientesSelecionados((prev) => prev.filter((c) => c.id !== id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setClientesSelecionados((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id)
        const newIndex = items.findIndex((i) => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('Nome da rota é obrigatório')
      return
    }
    if (clientesSelecionados.length === 0) {
      toast.error('Adicione ao menos um cliente à rota')
      return
    }
    if (!user) return
    setLoading(true)

    if (isEditing && rotaId) {
      const { error: uErr } = await supabase
        .from('rotas')
        .update({ nome: nome.trim() })
        .eq('id', rotaId)
      if (uErr) {
        toast.error('Erro ao atualizar rota')
        setLoading(false)
        return
      }

      const { error: dErr } = await supabase.from('rota_clientes').delete().eq('rota_id', rotaId)
      if (dErr) {
        toast.error('Erro ao atualizar paradas')
        setLoading(false)
        return
      }

      const paradas = clientesSelecionados.map((c, idx) => ({
        rota_id: rotaId,
        cliente_id: c.id,
        ordem: idx,
      }))
      const { error: pErr } = await supabase.from('rota_clientes').insert(paradas)
      setLoading(false)
      if (pErr) {
        toast.error('Erro ao salvar paradas')
      } else {
        toast.success('Rota atualizada')
        navigate(`/rotas/${rotaId}`, { replace: true })
      }
      return
    }

    const { count } = await supabase
      .from('rotas')
      .select('id', { count: 'exact', head: true })
      .eq('vendedor_id', user.id)
      .eq('ativo', true)

    const { data: rota, error } = await supabase
      .from('rotas')
      .insert({
        vendedor_id: user.id,
        nome: nome.trim(),
        ordem: count ?? 0,
      })
      .select('id')
      .single()

    if (error || !rota) {
      toast.error('Erro ao criar rota')
      setLoading(false)
      return
    }

    const paradas = clientesSelecionados.map((c, idx) => ({
      rota_id: rota.id,
      cliente_id: c.id,
      ordem: idx,
    }))

    const { error: pErr } = await supabase.from('rota_clientes').insert(paradas)
    setLoading(false)
    if (pErr) {
      toast.error('Rota criada, mas erro ao salvar paradas')
    } else {
      toast.success('Rota criada')
    }
    navigate(`/rotas/${rota.id}`, { replace: true })
  }

  if (loadingData) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-4 text-lg font-bold text-gray-900">
        {isEditing ? 'Editar Rota' : 'Nova Rota'}
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        Uma rota é um agrupamento reutilizável de clientes na sequência em que você costuma visitá-los.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Nome da Rota</label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder='Ex: "Centro - Segunda"'
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Adicionar Clientes</label>
          <SearchInput
            value={searchQuery}
            onChange={searchClientes}
            placeholder="Buscar cliente..."
            debounceMs={200}
          />
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-lg border border-gray-200 bg-white shadow-lg">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => addCliente(c)}
                  disabled={clientesSelecionados.some((s) => s.id === c.id)}
                  className="w-full px-3 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-40"
                >
                  <span className="font-medium">{c.fantasia}</span>
                  {c.bairro && <span className="ml-2 text-gray-400">— {c.bairro}</span>}
                </button>
              ))}
              {searchHasMore && (
                <button
                  type="button"
                  onClick={() => void loadMoreSearchClientes()}
                  className="w-full border-t border-gray-100 px-3 py-2 text-center text-xs font-medium text-primary-700 hover:bg-primary-50"
                >
                  Carregar mais resultados
                </button>
              )}
            </div>
          )}
        </div>

        {clientesSelecionados.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600">
              Paradas ({clientesSelecionados.length}) — arraste para reordenar
            </p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={clientesSelecionados} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {clientesSelecionados.map((item, idx) => (
                    <SortableCliente
                      key={item.id}
                      item={item}
                      index={idx}
                      onRemove={() => removeCliente(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <LoadingButton type="submit" loading={loading} className="w-full">
          {isEditing ? 'Salvar Alterações' : 'Criar Rota'}
        </LoadingButton>
      </form>
    </div>
  )
}
