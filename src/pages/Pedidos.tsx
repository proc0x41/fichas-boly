import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { SearchInput } from '../components/SearchInput'
import { EmptyState } from '../components/EmptyState'
import { PaginationBar } from '../components/PaginationBar'
import { Loader2, ShoppingBag, ChevronRight, Send } from 'lucide-react'
import { normCodigo } from '../lib/utils'
import type { TipoVisita, StatusVisita } from '../types'

type FiltroTipo = 'pedido' | 'orcamento'

interface PedidoRow {
  id: string
  cliente_id: string
  numero_pedido: number | null
  data_visita: string
  tipo_visita: TipoVisita
  status: StatusVisita
  condicoes_pagamento: string | null
  valor_frete: number
  desconto_percent: number
  total_itens: number
  valor_total: number
  enviado_representada_em: string | null
  cliente_fantasia: string
}

const PAGE_SIZE = 30

const tipoLabel: Record<TipoVisita, string> = {
  pedido: 'Pedido',
  orcamento: 'Orçamento',
  visita: 'Visita',
}

const statusLabel: Record<StatusVisita, string> = {
  pedido: 'Pedido',
  visitado: 'Visitado',
  pendente: 'Pendente',
  nao_encontrado: 'Não enc.',
  reagendado: 'Reagendado',
}

const statusColor: Record<StatusVisita, string> = {
  pedido: 'bg-gray-100 text-gray-600',
  visitado: 'bg-green-50 text-green-700',
  pendente: 'bg-gray-100 text-gray-500',
  nao_encontrado: 'bg-red-50 text-red-600',
  reagendado: 'bg-yellow-50 text-yellow-700',
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function Pedidos() {
  const { user } = useAuth()
  const [rows, setRows] = useState<PedidoRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('pedido')
  const [loading, setLoading] = useState(true)
  const [precos, setPrecos] = useState<Map<string, number>>(new Map())

  // Carrega catálogo de preços uma vez (mapa código normalizado → preço de tabela).
  useEffect(() => {
    let cancelled = false
    void supabase
      .from('produtos')
      .select('codigo, preco_tabela')
      .eq('ativo', true)
      .then(({ data }) => {
        if (cancelled) return
        const m = new Map<string, number>()
        for (const p of data ?? []) {
          m.set(normCodigo(p.codigo as string), Number(p.preco_tabela))
        }
        setPrecos(m)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [search, filtroTipo])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let q = supabase
      .from('visitas')
      .select(
        `id, numero_pedido, data_visita, tipo_visita, status,
         condicoes_pagamento, valor_frete, desconto_percent,
         enviado_representada_em, cliente_id,
         cliente:clientes(fantasia),
         codigos:visita_codigos(id, codigo, quantidade)`,
        { count: 'exact' },
      )
      .eq('vendedor_id', user.id)
      .eq('tipo_visita', filtroTipo)
      .order('data_visita', { ascending: false })
      .order('criado_em', { ascending: false })
      .range(from, to)

    if (search.trim()) {
      q = q.ilike('cliente.fantasia', `%${search.trim()}%`)
    }

    const { data, error, count } = await q

    if (error) {
      setRows([])
      setTotal(0)
    } else {
      setRows(
        (data ?? []).map((r) => {
          const raw = r as Record<string, unknown>
          const cliente = raw.cliente as { fantasia: string } | null
          const codigos = (raw.codigos as { codigo: string; quantidade: number }[] | null) ?? []
          const desc = Number((raw.desconto_percent as number | null) ?? 0)
          const frete = Number((raw.valor_frete as number | null) ?? 0)
          const fator = 1 - desc / 100
          let subtotal = 0
          for (const c of codigos) {
            const preco = precos.get(normCodigo(c.codigo)) ?? 0
            subtotal += preco * c.quantidade
          }
          const valorTotal = subtotal * fator + frete
          return {
            id: raw.id as string,
            cliente_id: raw.cliente_id as string,
            numero_pedido: (raw.numero_pedido as number | null) ?? null,
            data_visita: raw.data_visita as string,
            tipo_visita: (raw.tipo_visita as TipoVisita) ?? 'pedido',
            status: raw.status as StatusVisita,
            condicoes_pagamento: (raw.condicoes_pagamento as string | null) ?? null,
            valor_frete: frete,
            desconto_percent: desc,
            total_itens: codigos.length,
            valor_total: valorTotal,
            enviado_representada_em: (raw.enviado_representada_em as string | null) ?? null,
            cliente_fantasia: cliente?.fantasia ?? '—',
          }
        }),
      )
      setTotal(count ?? 0)
      if ((data?.length ?? 0) === 0 && page > 1) setPage((p) => Math.max(1, p - 1))
    }

    setLoading(false)
  }, [user, page, search, filtroTipo, precos])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const filtros: { value: FiltroTipo; label: string }[] = [
    { value: 'pedido', label: 'Pedidos' },
    { value: 'orcamento', label: 'Orçamentos' },
  ]

  return (
    <div className="px-4 pt-4 pb-6">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Pedidos e Orçamentos</h2>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por cliente..."
      />

      <div className="mt-3 mb-4 flex gap-2">
        {filtros.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltroTipo(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filtroTipo === f.value
                ? 'border-blue-500 bg-blue-600 text-white'
                : 'border-gray-300 bg-white text-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto self-center text-xs text-gray-400">{total} resultado{total !== 1 ? 's' : ''}</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-12 w-12" />}
          title="Nenhum pedido encontrado"
          description={search ? 'Tente outros filtros.' : 'Seus pedidos e orçamentos aparecem aqui.'}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/clientes/${r.cliente_id}/visita/${r.id}/editar`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm active:bg-gray-50"
            >
              {/* Tipo badge + Enviado badge */}
              <div className="flex shrink-0 flex-col items-start gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    r.tipo_visita === 'orcamento'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {tipoLabel[r.tipo_visita]}
                </span>
                {r.enviado_representada_em && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-700">
                    <Send className="h-2.5 w-2.5" />
                    Enviado
                  </span>
                )}
              </div>

              {/* Info central */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <p className="truncate text-sm font-semibold text-gray-900">{r.cliente_fantasia}</p>
                  {r.numero_pedido != null && (
                    <span className="shrink-0 text-xs text-gray-400">#{r.numero_pedido}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-xs text-gray-500">
                    {new Date(r.data_visita + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">
                    {r.total_itens} {r.total_itens === 1 ? 'item' : 'itens'}
                  </span>
                  {r.condicoes_pagamento && (
                    <>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="max-w-[120px] truncate text-xs text-gray-500">{r.condicoes_pagamento}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Valor + status + seta */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {fmtBRL(r.valor_total)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[r.status]}`}>
                  {statusLabel[r.status]}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            </Link>
          ))}
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
