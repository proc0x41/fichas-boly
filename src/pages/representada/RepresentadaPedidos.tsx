import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { SearchInput } from '../../components/SearchInput'
import { EmptyState } from '../../components/EmptyState'
import { PaginationBar } from '../../components/PaginationBar'
import { Loader2, FileText, ChevronRight, CheckCircle2, Clock } from 'lucide-react'
import { formatarDataBr, normCodigo } from '../../lib/utils'

type Filtro = 'pendentes' | 'emitidas' | 'todos'

interface PedidoRow {
  id: string
  numero_pedido: number | null
  data_visita: string
  compartilhado_em: string
  nota_emitida_em: string | null
  cliente_fantasia: string
  cliente_cnpj: string | null
  vendedor_nome: string
  total_itens: number
  valor_total: number
}

const PAGE_SIZE = 30

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function RepresentadaPedidos() {
  const [rows, setRows] = useState<PedidoRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [loading, setLoading] = useState(true)
  const [precos, setPrecos] = useState<Map<string, number>>(new Map())
  const [precosLoaded, setPrecosLoaded] = useState(false)

  // Catálogo de preços (uma vez) para calcular o valor_total na lista.
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
        setPrecosLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1)
  }, [search, filtro])

  const load = useCallback(async () => {
    if (!precosLoaded) return
    setLoading(true)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    // Inner join no cliente quando há busca por nome — sem isso, o ilike no
    // embed só esconde o nome (volta null) e o pedido continua aparecendo.
    const clienteSelect = search.trim()
      ? 'cliente:clientes!inner(fantasia, cnpj)'
      : 'cliente:clientes(fantasia, cnpj)'

    let q = supabase
      .from('visitas')
      .select(
        `id, numero_pedido, data_visita, compartilhado_em, nota_emitida_em,
         desconto_percent, valor_frete, vendedor_id,
         ${clienteSelect},
         codigos:visita_codigos(codigo, quantidade, desconto_percent_override)`,
        { count: 'exact' },
      )
      .eq('tipo_visita', 'pedido')
      .not('compartilhado_em', 'is', null)
      .order('compartilhado_em', { ascending: false })
      .range(from, to)

    if (filtro === 'pendentes') {
      q = q.is('nota_emitida_em', null)
    } else if (filtro === 'emitidas') {
      q = q.not('nota_emitida_em', 'is', null)
    }

    if (search.trim()) {
      q = q.ilike('cliente.fantasia', `%${search.trim()}%`)
    }

    const { data, error, count } = await q

    if (error) {
      setRows([])
      setTotal(0)
      setLoading(false)
      return
    }

    // Resolve nomes dos vendedores em uma query separada (visitas.vendedor_id
    // referencia auth.users, então PostgREST não embeda perfis automaticamente).
    const vendedorIds = Array.from(
      new Set((data ?? []).map((r) => (r as { vendedor_id: string }).vendedor_id).filter(Boolean)),
    )
    const nomePorVendedor = new Map<string, string>()
    if (vendedorIds.length > 0) {
      const { data: perfisData } = await supabase
        .from('perfis')
        .select('user_id, nome')
        .in('user_id', vendedorIds)
      for (const p of perfisData ?? []) {
        nomePorVendedor.set(p.user_id as string, p.nome as string)
      }
    }

    setRows(
      (data ?? []).map((r) => {
        const raw = r as Record<string, unknown>
        const cliente = raw.cliente as { fantasia: string; cnpj: string | null } | null
        const codigos =
          (raw.codigos as
            | { codigo: string; quantidade: number; desconto_percent_override: number | null }[]
            | null) ?? []
        const desc = Number((raw.desconto_percent as number | null) ?? 0)
        const frete = Number((raw.valor_frete as number | null) ?? 0)
        let totalLiquido = 0
        for (const c of codigos) {
          const preco = precos.get(normCodigo(c.codigo)) ?? 0
          const override = c.desconto_percent_override
          const efetivo = override !== null && override !== undefined ? Number(override) : desc
          totalLiquido += preco * (1 - efetivo / 100) * c.quantidade
        }
        return {
          id: raw.id as string,
          numero_pedido: (raw.numero_pedido as number | null) ?? null,
          data_visita: raw.data_visita as string,
          compartilhado_em: raw.compartilhado_em as string,
          nota_emitida_em: (raw.nota_emitida_em as string | null) ?? null,
          cliente_fantasia: cliente?.fantasia ?? '—',
          cliente_cnpj: cliente?.cnpj ?? null,
          vendedor_nome: nomePorVendedor.get(raw.vendedor_id as string) ?? '—',
          total_itens: codigos.length,
          valor_total: totalLiquido + frete,
        }
      }),
    )
    setTotal(count ?? 0)
    if ((data?.length ?? 0) === 0 && page > 1) setPage((p) => Math.max(1, p - 1))

    setLoading(false)
  }, [page, search, filtro, precos, precosLoaded])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const filtros: { value: Filtro; label: string }[] = [
    { value: 'pendentes', label: 'Pendentes' },
    { value: 'emitidas', label: 'Emitidas' },
    { value: 'todos', label: 'Todos' },
  ]

  return (
    <div className="px-4 pt-4 pb-6">
      <h2 className="mb-1 text-lg font-bold text-gray-900">Pedidos para emitir NF</h2>
      <p className="mb-4 text-xs text-gray-500">
        Pedidos compartilhados pelos vendedores. Marque como "NF emitida" depois de emitir.
      </p>

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
            onClick={() => setFiltro(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filtro === f.value
                ? 'border-primary-500 bg-primary-600 text-white'
                : 'border-gray-300 bg-white text-gray-600'
            }`}
          >
            {f.label}
          </button>
        ))}
        {total > 0 && (
          <span className="ml-auto self-center text-xs text-gray-400">
            {total} resultado{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Nenhum pedido encontrado"
          description={
            filtro === 'pendentes'
              ? 'Nenhum pedido pendente de NF.'
              : filtro === 'emitidas'
                ? 'Nenhuma NF emitida.'
                : 'Pedidos compartilhados aparecerão aqui.'
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/representada/pedido/${r.id}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm active:bg-gray-50"
            >
              <div className="flex shrink-0 flex-col items-start gap-1">
                {r.nota_emitida_em ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Emitida
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    <Clock className="h-2.5 w-2.5" />
                    Pendente
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {r.cliente_fantasia}
                  </p>
                  {r.numero_pedido != null && (
                    <span className="shrink-0 text-xs text-gray-400">#{r.numero_pedido}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-xs text-gray-500">{formatarDataBr(r.data_visita)}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">
                    {r.total_itens} {r.total_itens === 1 ? 'item' : 'itens'}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500 truncate">{r.vendedor_nome}</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {fmtBRL(r.valor_total)}
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
