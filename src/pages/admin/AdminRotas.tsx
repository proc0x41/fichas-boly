import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ProgressBar } from '../../components/ProgressBar'
import { ArrowLeft, Loader2 } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadRotas()
  }, [])

  const loadRotas = async () => {
    const { data } = await supabase
      .from('rotas')
      .select(
        '*, vendedor:perfis!rotas_vendedor_id_fkey(nome), paradas:rota_clientes(id), execucoes:rota_execucoes(id, iniciada_em, finalizada_em, visitas(status))',
      )
      .eq('ativo', true)
      .order('criado_em', { ascending: false })
      .limit(100)

    if (data) {
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
            vendedor: r.vendedor as { nome: string } | null,
            total_clientes: paradas.length,
            execucoes_ativas: ativas,
            ultima_execucao: ultima?.iniciada_em ?? null,
            ultima_visitadas: ultima
              ? (ultima.visitas ?? []).filter((v) => v.status === 'visitado').length
              : 0,
          }
        }),
      )
    }
    setLoading(false)
  }

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
        </div>
      )}
    </div>
  )
}
