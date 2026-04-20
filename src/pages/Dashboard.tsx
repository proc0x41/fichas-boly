import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { StatusBadge } from '../components/StatusBadge'
import { MapPin, Users, Plus, Loader2, Play, ChevronRight, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StatusVisita } from '../types'
import {
  CICLO_DIAS_DEFAULT,
  calcularStatusCiclo,
  descreverStatus,
  type RotaCicloStatus,
} from '../lib/ciclo'

interface ProximaParada {
  cliente_id: string
  cliente_nome: string
  bairro: string | null
  status: StatusVisita
  ordem: number
  /** Quando já existe visita nesta execução, abre edição em vez de formulário em branco */
  visita_id: string | null
}

interface ExecucaoAtiva {
  id: string
  nome: string
  iniciada_em: string
  total: number
  visitados: number
  proximas: ProximaParada[]
}

interface Sugestao {
  rota_id: string
  nome: string
  total_clientes: number
  status: RotaCicloStatus
}

export default function Dashboard() {
  const { user, perfil } = useAuth()
  const cicloDias = perfil?.ciclo_dias ?? CICLO_DIAS_DEFAULT
  const listaRodadaDesde = perfil?.lista_rodada_desde ?? null
  const [execucoes, setExecucoes] = useState<ExecucaoAtiva[]>([])
  const [sugestao, setSugestao] = useState<Sugestao | null>(null)
  const [iniciandoId, setIniciandoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadHome()
  }, [user, cicloDias, listaRodadaDesde])

  const loadHome = async () => {
    if (!user) return

    const { data: rotasData } = await supabase
      .from('rotas')
      .select(
        'id, nome, paradas:rota_clientes(id, cliente_id, ordem, cliente:clientes(fantasia, bairro)), execucoes:rota_execucoes(id, iniciada_em, finalizada_em, visitas(id, cliente_id, status))',
      )
      .eq('ativo', true)
      .order('ordem', { ascending: true })

    if (!rotasData) {
      setSugestao(null)
      setExecucoes([])
      setLoading(false)
      return
    }

    const rotas = rotasData as unknown as {
      id: string
      nome: string
      paradas: {
        id: string
        cliente_id: string
        ordem: number
        cliente: { fantasia: string; bairro: string | null } | null
      }[]
      execucoes: {
        id: string
        iniciada_em: string
        finalizada_em: string | null
        visitas: { id: string; cliente_id: string; status: string }[]
      }[]
    }[]

    const execucoesAtivas: ExecucaoAtiva[] = []
    const pendentes: Sugestao[] = []

    for (const r of rotas) {
      const paradas = (r.paradas ?? []).slice().sort((a, b) => a.ordem - b.ordem)
      const totalParadas = paradas.length
      const status = calcularStatusCiclo(r.execucoes ?? [], cicloDias, new Date(), listaRodadaDesde)

      const ativa = (r.execucoes ?? []).find((e) => !e.finalizada_em)
      if (ativa) {
        const visitaPorCliente = new Map<string, { id: string; status: StatusVisita }>()
        ;(ativa.visitas ?? []).forEach((v) =>
          visitaPorCliente.set(v.cliente_id, { id: v.id, status: v.status as StatusVisita }),
        )
        const listaStatus = paradas.map((p) => {
          const v = visitaPorCliente.get(p.cliente_id)
          return {
            cliente_id: p.cliente_id,
            cliente_nome: p.cliente?.fantasia ?? '',
            bairro: p.cliente?.bairro ?? null,
            ordem: p.ordem,
            status: (v?.status ?? 'pendente') as StatusVisita,
            visita_id: v?.id ?? null,
          }
        })
        execucoesAtivas.push({
          id: ativa.id,
          nome: r.nome,
          iniciada_em: ativa.iniciada_em,
          total: totalParadas,
          visitados: listaStatus.filter((p) => p.status === 'visitado').length,
          proximas: listaStatus.filter((p) => p.status !== 'visitado').slice(0, 3),
        })
      } else if (!status.feita && totalParadas > 0) {
        pendentes.push({ rota_id: r.id, nome: r.nome, total_clientes: totalParadas, status })
      }
    }

    pendentes.sort((a, b) => {
      const da = a.status.diasDesdeUltima ?? Number.POSITIVE_INFINITY
      const db = b.status.diasDesdeUltima ?? Number.POSITIVE_INFINITY
      return db - da
    })

    setExecucoes(execucoesAtivas)
    setSugestao(execucoesAtivas.length === 0 ? pendentes[0] ?? null : null)
    setLoading(false)
  }

  const iniciarSugestao = async () => {
    if (!user || !sugestao) return
    setIniciandoId(sugestao.rota_id)
    const { data, error } = await supabase
      .from('rota_execucoes')
      .insert({ rota_id: sugestao.rota_id, vendedor_id: user.id })
      .select('id')
      .single()
    setIniciandoId(null)
    if (error || !data) {
      toast.error('Erro ao iniciar rota')
      return
    }
    toast.success('Rota iniciada')
    window.location.href = `/rotas/execucao/${data.id}`
  }

  return (
    <div className="px-4 pt-4">
      <h2 className="text-lg font-bold text-gray-900">
        Olá, {perfil?.nome?.split(' ')[0] ?? 'Vendedor'}
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          to="/rotas"
          className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors active:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
            <Play className="h-5 w-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Iniciar Rota</span>
        </Link>
        <Link
          to="/clientes"
          className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center transition-colors active:bg-gray-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
            <Users className="h-5 w-5 text-primary-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Clientes</span>
        </Link>
      </div>

      {!loading && sugestao && (
        <div className="mb-6 rounded-xl border border-primary-200 bg-primary-50 p-4">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              Sugestão de hoje
            </h3>
          </div>
          <p className="text-base font-semibold text-gray-900">{sugestao.nome}</p>
          <p className="mb-3 text-xs text-gray-500">
            {descreverStatus(sugestao.status, cicloDias)} · {sugestao.total_clientes}{' '}
            {sugestao.total_clientes === 1 ? 'cliente' : 'clientes'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={iniciarSugestao}
              disabled={iniciandoId === sugestao.rota_id}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {iniciandoId === sugestao.rota_id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Iniciar agora
            </button>
            <Link
              to={`/rotas/${sugestao.rota_id}`}
              className="flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-600"
            >
              Ver rota
            </Link>
          </div>
        </div>
      )}

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Rotas em andamento
      </h3>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : execucoes.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title="Nenhuma rota em andamento"
          description="Inicie uma rota para ver as próximas lojas aqui."
          action={
            <Link
              to="/rotas"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white"
            >
              Ver Rotas
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {execucoes.map((exec) => (
            <div
              key={exec.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <Link to={`/rotas/execucao/${exec.id}`} className="block px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="truncate font-medium text-gray-900">{exec.nome}</h4>
                  <span className="text-xs text-gray-500">
                    {exec.visitados}/{exec.total}
                  </span>
                </div>
                <ProgressBar current={exec.visitados} total={exec.total} />
              </Link>
              {exec.proximas.length > 0 && (
                <div className="border-t border-gray-100">
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    Próximas lojas
                  </p>
                  {exec.proximas.map((p, idx) => (
                    <Link
                      key={p.cliente_id}
                      to={
                        p.visita_id
                          ? `/rotas/execucao/${exec.id}/visita/${p.cliente_id}/${p.visita_id}/editar`
                          : `/rotas/execucao/${exec.id}/visita/${p.cliente_id}`
                      }
                      className="flex items-center gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0 active:bg-gray-50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary-700">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {p.cliente_nome}
                        </p>
                        {p.bairro && <p className="text-xs text-gray-400">{p.bairro}</p>}
                      </div>
                      <StatusBadge status={p.status} />
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Link
        to="/rotas/nova"
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform active:scale-95"
        aria-label="Nova Rota"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  )
}
