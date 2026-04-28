import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ProgressBar } from '../../components/ProgressBar'
import { PaginationBar } from '../../components/PaginationBar'
import { ArrowLeft, Loader2 } from 'lucide-react'

const PAGE_SIZE = 20

interface RotaAdmin {
  id: string
  nome: string
  vendedor: { nome: string } | null
  total_clientes: number
  execucoes_ativas: number
  ultima_execucao: string | null
  ultima_visitadas: number
}

export default function AdminRotas() {
  const navigate = useNavigate()
  const [rotas, setRotas] = useState<RotaAdmin[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadRotas = useCallback(async () => {
    setLoading(true)
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const [{ data, count, error }, { data: perfisRows }] = await Promise.all([
      supabase
        .from('rotas')
        .select(
          'id, nome, vendedor_id, paradas:rota_clientes(id), execucoes:rota_execucoes(id, iniciada_em, finalizada_em, visitas(status))',
          { count: 'exact' },
        )
        .eq('ativo', true)
        .order('criado_em', { ascending: false })
        .range(from, to),
      supabase.from('perfis').select('user_id, nome').in('role', ['vendedor', 'admin']),
    ])

    if (error) {
      setRotas([])
      setTotal(0)
    } else if (data) {
      const nomePorUser = new Map((perfisRows ?? []).map((p) => [p.user_id as string, p.nome as string]))
      setRotas(
        data.map((r: Record<string, unknown>) => {
          const paradas = (r.paradas as { id: string }[]) ?? []
          const execucoes =
            (r.execucoes as {
              id: string
              iniciada_em: string
              finalizada_em: string | null
              visitas: { status: string }[]
            }[]) ?? []
          const ativas = execucoes.filter((e) => !e.finalizada_em).length
          const ultima = execucoes
            .slice()
            .sort((a, b) => b.iniciada_em.localeCompare(a.iniciada_em))[0]

          return {
            id: r.id as string,
            nome: r.nome as string,
            vendedor: { nome: nomePorUser.get(r.vendedor_id as string) ?? '—' },
            total_clientes: paradas.length,
            execucoes_ativas: ativas,
            ultima_execucao: ultima?.iniciada_em ?? null,
            ultima_visitadas: ultima
              ? (ultima.visitas ?? []).filter((v) => v.status === 'visitado').length
              : 0,
          }
        }),
      )
      setTotal(count ?? 0)
      if (data.length === 0 && page > 1) {
        setPage((p) => Math.max(1, p - 1))
      }
    }
    setLoading(false)
  }, [page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRotas()
  }, [loadRotas])

  return (
    <div className="px-4 pt-4">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
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
                {rota.execucoes_ativas > 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    {rota.execucoes_ativas} em andamento
                  </span>
                )}
              </div>
              <p className="mb-2 text-xs text-gray-500">
                Vendedor: {rota.vendedor?.nome ?? '—'} · {rota.total_clientes} clientes
                {rota.ultima_execucao &&
                  ` · última execução ${new Date(rota.ultima_execucao).toLocaleDateString('pt-BR')}`}
              </p>
              {rota.ultima_execucao && (
                <ProgressBar current={rota.ultima_visitadas} total={rota.total_clientes} />
              )}
            </div>
          ))}
          <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
