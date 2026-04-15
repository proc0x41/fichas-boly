import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChipInput } from '../components/ChipInput'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import type { StatusVisita } from '../types'

const statusOptions: { value: StatusVisita; label: string; color: string }[] = [
  { value: 'pendente', label: 'Pendente', color: 'bg-gray-100 text-gray-600 border-gray-300' },
  { value: 'visitado', label: 'Visitado', color: 'bg-green-50 text-green-700 border-green-400' },
  { value: 'nao_encontrado', label: 'Não encontrado', color: 'bg-red-50 text-red-700 border-red-400' },
  { value: 'reagendado', label: 'Reagendado', color: 'bg-yellow-50 text-yellow-700 border-yellow-400' },
]

export default function VisitaForm() {
  const { id: clienteIdFromCliente, clienteId: clienteIdFromRota, id: rotaId } = useParams()
  const isFromRota = Boolean(clienteIdFromRota)
  const clienteId = clienteIdFromRota || clienteIdFromCliente
  const navigate = useNavigate()
  const { user } = useAuth()

  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split('T')[0])
  const [status, setStatus] = useState<StatusVisita>('visitado')
  const [observacao, setObservacao] = useState('')
  const [codigos, setCodigos] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [clienteNome, setClienteNome] = useState('')

  useEffect(() => {
    if (clienteId) {
      supabase
        .from('clientes')
        .select('fantasia')
        .eq('id', clienteId)
        .single()
        .then(({ data }) => {
          if (data) setClienteNome(data.fantasia)
        })
    }
  }, [clienteId])

  const carregarUltimaVisita = async () => {
    if (!clienteId) return
    const { data } = await supabase
      .from('visitas')
      .select('id, codigos:visita_codigos(codigo)')
      .eq('cliente_id', clienteId)
      .order('data_visita', { ascending: false })
      .limit(1)
      .single()

    if (data?.codigos) {
      const codigosAnteriores = (data.codigos as { codigo: string }[]).map((c) => c.codigo)
      setCodigos(codigosAnteriores)
      toast.success(`${codigosAnteriores.length} código(s) carregados da última visita`)
    } else {
      toast('Nenhuma visita anterior encontrada')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clienteId || !user) return
    setLoading(true)

    const { data: visita, error } = await supabase
      .from('visitas')
      .insert({
        cliente_id: clienteId,
        vendedor_id: user.id,
        data_visita: dataVisita,
        status,
        observacao: observacao.trim() || null,
      })
      .select('id')
      .single()

    if (error || !visita) {
      toast.error('Erro ao registrar visita')
      setLoading(false)
      return
    }

    if (codigos.length > 0) {
      const { error: codErr } = await supabase.from('visita_codigos').insert(
        codigos.map((codigo) => ({ visita_id: visita.id, codigo })),
      )
      if (codErr) {
        toast.error('Visita salva, mas erro ao salvar códigos')
      }
    }

    if (isFromRota && rotaId) {
      await supabase
        .from('rota_clientes')
        .update({ visita_id: visita.id })
        .eq('rota_id', rotaId)
        .eq('cliente_id', clienteId)
    }

    toast.success('Visita registrada')
    setLoading(false)
    navigate(-1)
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <h2 className="mb-1 text-lg font-bold text-gray-900">Registrar Visita</h2>
      {clienteNome && <p className="mb-4 text-sm text-gray-500">{clienteNome}</p>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Data da Visita</label>
          <input
            type="date"
            value={dataVisita}
            onChange={(e) => setDataVisita(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Status</label>
          <div className="grid grid-cols-2 gap-2">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                  status === opt.value
                    ? opt.color + ' border-current'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Observação</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
            placeholder="Observações sobre a visita..."
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600">Códigos de Produto</label>
            <button
              type="button"
              onClick={carregarUltimaVisita}
              className="flex items-center gap-1 text-xs font-medium text-primary-600"
            >
              <RotateCcw className="h-3 w-3" />
              Reaproveitar última
            </button>
          </div>
          <ChipInput codigos={codigos} onChange={setCodigos} />
        </div>

        <LoadingButton type="submit" loading={loading} className="w-full">
          Salvar Visita
        </LoadingButton>
      </form>
    </div>
  )
}
