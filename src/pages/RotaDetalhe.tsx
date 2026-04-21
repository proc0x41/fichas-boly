import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { LoadingButton } from '../components/LoadingButton'
import { ProgressBar } from '../components/ProgressBar'
import { ArrowLeft, Loader2, Pencil, Play, Trash2, ChevronRight, MapPin } from 'lucide-react'
import toast from 'react-hot-toast'

interface ParadaTemplate {
  id: string
  cliente_id: string
  ordem: number
  cliente: { fantasia: string; bairro: string | null }
}

interface ExecucaoResumo {
  id: string
  iniciada_em: string
  finalizada_em: string | null
  total_visitadas: number
}

export default function RotaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [nome, setNome] = useState('')
  const [paradas, setParadas] = useState<ParadaTemplate[]>([])
  const [execucoes, setExecucoes] = useState<ExecucaoResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [iniciando, setIniciando] = useState(false)
  const [deletando, setDeletando] = useState(false)

  useEffect(() => {
    if (!id) return
    loadRota()
  }, [id])

  const loadRota = async () => {
    setLoading(true)
    const [{ data: rota }, { data: paradasData }, { data: execData }] = await Promise.all([
      supabase.from('rotas').select('nome').eq('id', id).single(),
      supabase
        .from('rota_clientes')
        .select('id, cliente_id, ordem, cliente:clientes(fantasia, bairro)')
        .eq('rota_id', id)
        .order('ordem'),
      supabase
        .from('rota_execucoes')
        .select('id, iniciada_em, finalizada_em, visitas(id, status)')
        .eq('rota_id', id)
        .order('finalizada_em', { ascending: true, nullsFirst: true })
        .order('iniciada_em', { ascending: false })
        .limit(80),
    ])

    if (rota) setNome(rota.nome)
    if (paradasData) setParadas(paradasData as unknown as ParadaTemplate[])
    if (execData) {
      setExecucoes(
        (execData as { id: string; iniciada_em: string; finalizada_em: string | null; visitas: { status: string }[] }[]).map(
          (e) => ({
            id: e.id,
            iniciada_em: e.iniciada_em,
            finalizada_em: e.finalizada_em,
            total_visitadas: (e.visitas ?? []).filter((v) => v.status === 'visitado').length,
          }),
        ),
      )
    }
    setLoading(false)
  }

  const iniciarRota = async () => {
    if (!user || !id) return
    const ativa = execucoes.find((e) => !e.finalizada_em)
    if (ativa) {
      navigate(`/rotas/execucao/${ativa.id}`)
      return
    }
    setIniciando(true)
    const { data, error } = await supabase
      .from('rota_execucoes')
      .insert({ rota_id: id, vendedor_id: user.id })
      .select('id')
      .single()
    setIniciando(false)
    if (error || !data) {
      toast.error('Erro ao iniciar rota')
      return
    }
    toast.success('Rota iniciada')
    navigate(`/rotas/execucao/${data.id}`)
  }

  const deletarRota = async () => {
    if (!id) return
    if (!confirm('Excluir esta rota? Todas as execuções também serão removidas.')) return
    setDeletando(true)
    const { error } = await supabase.from('rotas').delete().eq('id', id)
    setDeletando(false)
    if (error) {
      toast.error('Erro ao excluir')
      return
    }
    toast.success('Rota excluída')
    navigate('/rotas', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  const execucaoAtiva = execucoes.find((e) => !e.finalizada_em)

  return (
    <div className="px-4 pt-4 pb-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-gray-900">{nome}</h2>
          <p className="text-xs text-gray-400">
            {paradas.length} {paradas.length === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to={`/rotas/${id}/editar`}
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
          <button
            onClick={deletarRota}
            disabled={deletando}
            className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        </div>
      </div>

      <LoadingButton
        onClick={iniciarRota}
        loading={iniciando}
        className="mb-6 w-full"
        disabled={paradas.length === 0}
      >
        <Play className="h-4 w-4" />
        {execucaoAtiva ? 'Continuar rota em andamento' : 'Iniciar rota hoje'}
      </LoadingButton>

      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Sequência de Clientes
      </h3>
      {paradas.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-10 w-10" />}
          title="Sem clientes nesta rota"
          description="Edite a rota para adicionar clientes."
        />
      ) : (
        <div className="mb-6 space-y-2">
          {paradas.map((p, idx) => (
            <Link
              key={p.id}
              to={`/clientes/${p.cliente_id}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">{p.cliente.fantasia}</p>
                {p.cliente.bairro && (
                  <p className="text-xs text-gray-400">{p.cliente.bairro}</p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </Link>
          ))}
        </div>
      )}

      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Histórico de Execuções
      </h3>
      {execucoes.length === 0 ? (
        <p className="text-sm text-gray-400">Ainda não iniciada.</p>
      ) : (
        <div className="space-y-2">
          {execucoes.map((e) => (
            <Link
              key={e.id}
              to={`/rotas/execucao/${e.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">
                  {new Date(e.iniciada_em).toLocaleDateString('pt-BR')}{' '}
                  <span className="text-xs text-gray-400">
                    · {new Date(e.iniciada_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    e.finalizada_em
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {e.finalizada_em ? 'Finalizada' : 'Em andamento'}
                </span>
              </div>
              <ProgressBar current={e.total_visitadas} total={paradas.length} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
