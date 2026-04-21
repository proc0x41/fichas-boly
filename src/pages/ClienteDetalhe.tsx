import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'
import { PaginationBar } from '../components/PaginationBar'
import { ArrowLeft, Pencil, Plus, Loader2, ClipboardList } from 'lucide-react'
import { maskCNPJ, maskCEP, maskTelefone } from '../lib/masks'
import type { Cliente, Visita, VisitaCodigo, StatusVisita } from '../types'

type VisitaComCodigos = Visita & { codigos: VisitaCodigo[] }

const VISITAS_PAGE_SIZE = 15

export default function ClienteDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [visitas, setVisitas] = useState<VisitaComCodigos[]>([])
  const [visitasTotal, setVisitasTotal] = useState(0)
  const [visitasPage, setVisitasPage] = useState(1)
  const [loading, setLoading] = useState(true)
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
          setVisitas([])
          setVisitasTotal(0)
          setLoading(false)
          return
        }
        setCliente(data as Cliente)
        const page = clienteMudou ? 1 : visitasPage
        const from = (page - 1) * VISITAS_PAGE_SIZE
        const to = from + VISITAS_PAGE_SIZE - 1
        const vRes = await supabase
          .from('visitas')
          .select('*, codigos:visita_codigos(*)', { count: 'exact' })
          .eq('cliente_id', id)
          .order('data_visita', { ascending: false })
          .range(from, to)
        if (cancelled) return
        if (vRes.data) {
          setVisitas(vRes.data as VisitaComCodigos[])
          setVisitasTotal(vRes.count ?? 0)
          if (vRes.data.length === 0 && page > 1) {
            setVisitasPage((p) => Math.max(1, p - 1))
          }
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, visitasPage])

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

  const info = [
    { label: 'Razão Social', value: cliente.razao_social },
    { label: 'CNPJ', value: cliente.cnpj ? maskCNPJ(cliente.cnpj) : null },
    { label: 'IE', value: cliente.inscricao_estadual },
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
    { label: 'Telefone', value: cliente.telefone ? maskTelefone(cliente.telefone) : null },
    { label: 'E-mail', value: cliente.email },
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
          <h2 className="text-lg font-bold text-gray-900">{cliente.fantasia}</h2>
          {!cliente.ativo && (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
              Inativo
            </span>
          )}
        </div>
        <Link
          to={`/clientes/${id}/editar`}
          className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors active:bg-gray-200"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Link>
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
      </div>

      <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Histórico de Visitas
      </h3>

      {visitas.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="Nenhuma visita registrada"
        />
      ) : (
        <div className="space-y-3">
          {visitas.map((v) => (
            <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  {new Date(v.data_visita).toLocaleDateString('pt-BR')}
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={v.status as StatusVisita} />
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
        Registrar Visita
      </Link>
    </div>
  )
}
