import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { PaginationBar } from '../components/PaginationBar'
import { ArrowLeft, Pencil, Plus, Loader2, ClipboardList, Trash2, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { maskCNPJ, maskCEP, maskTelefone, maskIE } from '../lib/masks'
import { normCodigo } from '../lib/utils'
import type { Cliente, ClienteContato, Visita, VisitaCodigo, StatusVisita, TipoVisita } from '../types'

type VisitaComCodigos = Visita & { codigos: VisitaCodigo[] }

interface ProdutoCliente {
  codigo: string
  descricao: string | null
  quantidadeTotal: number
  vezesPedido: number
  ultimaCompra: string
}

const VISITAS_PAGE_SIZE = 15

export default function ClienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [contatos, setContatos] = useState<ClienteContato[]>([])
  const [visitas, setVisitas] = useState<VisitaComCodigos[]>([])
  const [visitasTotal, setVisitasTotal] = useState(0)
  const [visitasPage, setVisitasPage] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoVisita>('todos')
  const [produtosCliente, setProdutosCliente] = useState<ProdutoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [deletando, setDeletando] = useState(false)
  const lastClienteIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!id) return
    const clienteMudou = lastClienteIdRef.current !== id
    lastClienteIdRef.current = id
    if (clienteMudou && visitasPage !== 1) {
      setVisitasPage(1)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setCliente(null)
          setContatos([])
          setVisitas([])
          setVisitasTotal(0)
          setLoading(false)
          return
        }
        setCliente(data as Cliente)
        let visitasQuery = supabase
          .from('visitas')
          .select('*, codigos:visita_codigos(*)', { count: 'exact' })
          .eq('cliente_id', id)
          .order('data_visita', { ascending: false })

        if (filtroTipo !== 'todos') {
          visitasQuery = visitasQuery.eq('tipo_visita', filtroTipo)
        }

        const [contatosRes, vRes] = await Promise.all([
          supabase
            .from('cliente_contatos')
            .select('*')
            .eq('cliente_id', id)
            .order('ordem'),
          visitasQuery.range(
            clienteMudou ? 0 : (visitasPage - 1) * VISITAS_PAGE_SIZE,
            clienteMudou ? VISITAS_PAGE_SIZE - 1 : visitasPage * VISITAS_PAGE_SIZE - 1,
          ),
        ])
        if (cancelled) return
        setContatos((contatosRes.data as ClienteContato[]) ?? [])
        if (vRes.data) {
          setVisitas(vRes.data as VisitaComCodigos[])
          setVisitasTotal(vRes.count ?? 0)
          if (vRes.data.length === 0 && visitasPage > 1) {
            setVisitasPage((p) => Math.max(1, p - 1))
          }
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, visitasPage, filtroTipo])

  // Lista agregada de produtos comprados pelo cliente (apenas pedidos firmes).
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data: pedidos, error } = await supabase
        .from('visitas')
        .select('data_visita, codigos:visita_codigos(codigo, quantidade)')
        .eq('cliente_id', id)
        .eq('tipo_visita', 'pedido')
        .order('data_visita', { ascending: false })
      if (cancelled || error || !pedidos) {
        if (!cancelled) setProdutosCliente([])
        return
      }

      const agregado = new Map<string, ProdutoCliente>()
      for (const p of pedidos as Array<{ data_visita: string; codigos: { codigo: string; quantidade: number }[] }>) {
        for (const c of p.codigos ?? []) {
          const key = normCodigo(c.codigo)
          const existente = agregado.get(key)
          if (existente) {
            existente.quantidadeTotal += c.quantidade
            existente.vezesPedido += 1
            if (p.data_visita > existente.ultimaCompra) existente.ultimaCompra = p.data_visita
          } else {
            agregado.set(key, {
              codigo: c.codigo,
              descricao: null,
              quantidadeTotal: c.quantidade,
              vezesPedido: 1,
              ultimaCompra: p.data_visita,
            })
          }
        }
      }

      if (agregado.size > 0) {
        const { data: produtos } = await supabase
          .from('produtos')
          .select('codigo, descricao')
        if (cancelled) return
        const descPorCodigo = new Map<string, string>()
        for (const pr of produtos ?? []) {
          descPorCodigo.set(normCodigo(pr.codigo), pr.descricao)
        }
        for (const [key, item] of agregado) {
          const desc = descPorCodigo.get(key)
          if (desc) item.descricao = desc
        }
      }

      const lista = Array.from(agregado.values()).sort((a, b) => {
        if (b.ultimaCompra !== a.ultimaCompra) return b.ultimaCompra.localeCompare(a.ultimaCompra)
        return b.quantidadeTotal - a.quantidadeTotal
      })
      setProdutosCliente(lista)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className="px-4 pt-4">
        <EmptyState title="Cliente não encontrado" />
      </div>
    )
  }

  const deletarCliente = async () => {
    if (!confirm('Excluir este cliente? Esta ação não pode ser desfeita.')) return
    setDeletando(true)
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    setDeletando(false)
    if (error) {
      toast.error('Erro ao excluir cliente')
      return
    }
    toast.success('Cliente excluído')
    navigate('/clientes')
  }

  const info = [
    { label: 'Razão Social', value: cliente.razao_social },
    { label: 'CNPJ', value: cliente.cnpj ? maskCNPJ(cliente.cnpj) : null },
    { label: 'IE', value: cliente.inscricao_estadual ? maskIE(cliente.inscricao_estadual) : null },
    {
      label: 'Endereço',
      value: [
        cliente.endereco,
        cliente.numero,
        cliente.bairro,
        cliente.cidade,
        cliente.estado,
        cliente.cep ? maskCEP(cliente.cep) : null,
      ].filter(Boolean).join(', '),
    },
    { label: 'Comprador', value: cliente.comprador },
    { label: 'Dia de Compras', value: cliente.dia_compras },
    {
      label: 'Cliente Desde',
      value: cliente.cliente_desde
        ? new Date(cliente.cliente_desde).toLocaleDateString('pt-BR')
        : null,
    },
    {
      label: 'Displays',
      value: `Chão: ${cliente.display_chao} | Balcão: ${cliente.display_balcao} | Parede: ${cliente.display_parede} (Total: ${cliente.total_itens})`,
    },
  ]

  return (
    <div className="px-4 pt-4 pb-24">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{cliente.fantasia}</h2>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                cliente.is_cliente
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-orange-100 text-orange-700'
              }`}
            >
              {cliente.is_cliente ? 'Cliente' : 'Prospect'}
            </span>
          </div>
          {!cliente.ativo && (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              Inativo
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/clientes/${id}/editar`}
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors active:bg-gray-200"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
          <button
            type="button"
            onClick={deletarCliente}
            disabled={deletando}
            className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white">
        {info.map(
          ({ label, value }) =>
            value && (
              <div key={label} className="border-b border-gray-100 px-4 py-3 last:border-0">
                <p className="text-xs font-medium text-gray-400">{label}</p>
                <p className="text-sm text-gray-800">{value}</p>
              </div>
            ),
        )}
        {contatos.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-3">
            <p className="mb-2 text-xs font-medium text-gray-400">Contatos</p>
            <div className="space-y-1">
              {(['telefone', 'email'] as const).flatMap((tipo) =>
                contatos
                  .filter((c) => c.tipo === tipo)
                  .map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 uppercase">
                        {tipo === 'telefone' ? 'Tel' : 'Email'}
                      </span>
                      <span className="text-sm text-gray-800">
                        {tipo === 'telefone' ? maskTelefone(c.valor) : c.valor}
                      </span>
                      {c.rotulo && (
                        <span className="text-xs text-gray-400">({c.rotulo})</span>
                      )}
                    </div>
                  )),
              )}
            </div>
          </div>
        )}
      </div>

      <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Produtos comprados
      </h3>
      {produtosCliente.length === 0 ? (
        <div className="mb-6 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-400">
          Nenhum produto comprado ainda. Os itens dos pedidos aparecerão aqui automaticamente.
        </div>
      ) : (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <Package className="h-3.5 w-3.5" />
            <span>{produtosCliente.length} {produtosCliente.length === 1 ? 'produto' : 'produtos'}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {produtosCliente.map((p) => (
              <li key={p.codigo} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{p.codigo}</p>
                    {p.descricao && (
                      <p className="truncate text-xs text-gray-500">{p.descricao}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      Última compra: {new Date(p.ultimaCompra + 'T12:00:00').toLocaleDateString('pt-BR')}
                      {p.vezesPedido > 1 && ` · ${p.vezesPedido} pedidos`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    {p.quantidadeTotal} un
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Histórico de Pedidos e Orçamentos
      </h3>

      <div className="mb-3 flex gap-2">
        {([['todos', 'Todos'], ['pedido', 'Pedidos'], ['orcamento', 'Orçamentos'], ['visita', 'Visitas']] as const).map(
          ([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => {
                setFiltroTipo(val)
                setVisitasPage(1)
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filtroTipo === val
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {visitas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="Nenhum pedido ou orçamento registrado"
        />
      ) : (
        <div className="space-y-3">
          {visitas.map((v) => (
            <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">
                    {new Date(v.data_visita).toLocaleDateString('pt-BR')}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      v.tipo_visita === 'orcamento'
                        ? 'bg-amber-100 text-amber-700'
                        : v.tipo_visita === 'visita'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {v.tipo_visita === 'orcamento'
                      ? 'Orçamento'
                      : v.tipo_visita === 'visita'
                      ? 'Visita'
                      : 'Pedido'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {v.tipo_visita === 'visita' && <StatusBadge status={v.status as StatusVisita} />}
                  <Link
                    to={`/clientes/${id}/visita/${v.id}/editar`}
                    className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </Link>
                </div>
              </div>
              {v.condicoes_pagamento && (
                <p className="mb-1 text-xs text-gray-600">
                  <span className="font-medium">Pagamento:</span> {v.condicoes_pagamento}
                </p>
              )}
              {v.observacao && <p className="mb-2 text-xs text-gray-500">{v.observacao}</p>}
              {v.codigos && v.codigos.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {v.codigos.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                    >
                      <span>{c.codigo}</span>
                      <span className="rounded-full bg-white px-1 text-[10px] font-semibold text-gray-700">
                        ×{c.quantidade}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          <PaginationBar
            page={visitasPage}
            pageSize={VISITAS_PAGE_SIZE}
            total={visitasTotal}
            onPageChange={setVisitasPage}
          />
        </div>
      )}

      <Link
        to={`/clientes/${id}/visita/nova`}
        className="fixed bottom-20 right-4 z-20 flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-sm font-medium text-white shadow-lg transition-transform active:scale-95"
      >
        <Plus className="h-5 w-5" />
        Novo Pedido/Orçamento
      </Link>
    </div>
  )
}
