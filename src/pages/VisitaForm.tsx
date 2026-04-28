import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ChipInput, type ProdutoPreview } from '../components/ChipInput'
import { LoadingButton } from '../components/LoadingButton'
import { ArrowLeft, RotateCcw, Send, Trash2, Loader2, FileDown, Share2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { Cliente, ClienteContato, CodigoItem, StatusVisita, TipoVisita } from '../types'
import { linkMercosWhatsApp, podeEnviarMercos } from '../lib/mercos'
import { buildPedidoPdfBlob, type ProdutoCatalogo } from '../lib/pedidoPdf'
import { compartilharOuBaixarPdf } from '../lib/sharePedido'
import { normCodigo, parseMoneyInput, parsePercentInput } from '../lib/utils'

// Status só é mostrado quando tipo_visita = 'visita' (parada sem pedido).
// Pedido/orçamento são sempre 'visitado' implicitamente.
const statusOptions: { value: StatusVisita; label: string; color: string }[] = [
  { value: 'visitado', label: 'Visitado', color: 'bg-green-50 text-green-700 border-green-400' },
  { value: 'nao_encontrado', label: 'Não encontrado', color: 'bg-red-50 text-red-700 border-red-400' },
  { value: 'reagendado', label: 'Reagendado', color: 'bg-yellow-50 text-yellow-700 border-yellow-400' },
]

export default function VisitaForm() {
  const params = useParams()
  const clienteId = params.clienteId
  const execucaoId = params.execucaoId ?? null
  const visitaId = params.visitaId ?? null
  const isEditing = Boolean(visitaId)

  const navigate = useNavigate()
  const { user, perfil } = useAuth()

  const [dataVisita, setDataVisita] = useState(new Date().toISOString().split('T')[0])
  const [tipoVisita, setTipoVisita] = useState<TipoVisita>('pedido')
  const [status, setStatus] = useState<StatusVisita>('visitado')
  const [observacao, setObservacao] = useState('')
  const [condicoesPagamento, setCondicoesPagamento] = useState('')
  const [valorFrete, setValorFrete] = useState('0')
  const [descontoPercent, setDescontoPercent] = useState('0')
  const [numeroPedido, setNumeroPedido] = useState<number | null>(null)
  const [itens, setItens] = useState<CodigoItem[]>([])
  const isVisitaSimples = tipoVisita === 'visita'
  const [loading, setLoading] = useState(false)
  const [deletando, setDeletando] = useState(false)
  const [loadingData, setLoadingData] = useState(isEditing)
  const [exportando, setExportando] = useState(false)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteCNPJ, setClienteCNPJ] = useState<string | null>(null)
  const [clienteComprador, setClienteComprador] = useState<string | null>(null)
  const [clienteTelefone, setClienteTelefone] = useState<string | null>(null)
  const [catalogoProdutos, setCatalogoProdutos] = useState<Map<string, ProdutoPreview> | null>(null)

  useEffect(() => {
    supabase
      .from('produtos')
      .select('codigo, descricao, preco_tabela')
      .eq('ativo', true)
      .then(({ data }) => {
        const map = new Map<string, ProdutoPreview>()
        for (const p of data ?? []) {
          map.set(normCodigo(p.codigo), { descricao: p.descricao, preco_tabela: Number(p.preco_tabela) })
        }
        setCatalogoProdutos(map)
      })
  }, [])

  const lookupCodigo = useCallback(
    async (codigo: string): Promise<ProdutoPreview | null> => {
      if (!catalogoProdutos) return null
      const norm = normCodigo(codigo)
      // 1. correspondência exata
      const exact = catalogoProdutos.get(norm)
      if (exact) return exact
      // 2. correspondência por sufixo (ex: "0094" encontra "ar0094")
      for (const [key, prod] of catalogoProdutos) {
        if (key.endsWith(norm) && key !== norm) {
          return { ...prod, codigoCanonico: key.toUpperCase() }
        }
      }
      return null
    },
    [catalogoProdutos],
  )

  const precisaResolverVisitaNaRota = Boolean(execucaoId && clienteId && !visitaId)
  const [visitLookupDone, setVisitLookupDone] = useState(!precisaResolverVisitaNaRota)

  useEffect(() => {
    if (!precisaResolverVisitaNaRota || !clienteId || !execucaoId) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('visitas')
        .select('id')
        .eq('cliente_id', clienteId)
        .eq('rota_execucao_id', execucaoId)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        setVisitLookupDone(true)
        return
      }
      if (data?.id) {
        navigate(
          `/rotas/execucao/${execucaoId}/visita/${clienteId}/${data.id}/editar`,
          { replace: true },
        )
        return
      }
      setVisitLookupDone(true)
    })()
    return () => {
      cancelled = true
    }
  }, [precisaResolverVisitaNaRota, clienteId, execucaoId, navigate])

  useEffect(() => {
    if (!clienteId) return
    supabase
      .from('clientes')
      .select('fantasia, cnpj, comprador, telefone')
      .eq('id', clienteId)
      .single()
      .then(({ data }) => {
        if (data) {
          setClienteNome(data.fantasia)
          setClienteCNPJ(data.cnpj ?? null)
          setClienteComprador(data.comprador?.trim() || null)
          setClienteTelefone(data.telefone ?? null)
        }
      })
  }, [clienteId])

  useEffect(() => {
    if (!isEditing || !visitaId) return
    ;(async () => {
      const { data } = await supabase
        .from('visitas')
        .select('*, codigos:visita_codigos(codigo, quantidade)')
        .eq('id', visitaId)
        .single()
      if (data) {
        setDataVisita(data.data_visita)
        setStatus(data.status as StatusVisita)
        setObservacao(data.observacao ?? '')
        setCondicoesPagamento(data.condicoes_pagamento ?? '')
        const vf = (data as { valor_frete?: number }).valor_frete
        const dp = (data as { desconto_percent?: number }).desconto_percent
        const np = (data as { numero_pedido?: number }).numero_pedido
        setValorFrete(String(vf ?? 0))
        setDescontoPercent(
          Number(dp ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false }),
        )
        setNumeroPedido(np ?? null)
        setTipoVisita(((data as { tipo_visita?: string }).tipo_visita as TipoVisita) ?? 'pedido')
        setItens(
          ((data.codigos as { codigo: string; quantidade: number }[]) ?? []).map((c) => ({
            codigo: c.codigo,
            quantidade: c.quantidade,
          })),
        )
      }
      setLoadingData(false)
    })()
  }, [isEditing, visitaId])

  const carregarUltimaVisita = async () => {
    if (!clienteId) return
    const { data } = await supabase
      .from('visitas')
      .select('id, codigos:visita_codigos(codigo, quantidade)')
      .eq('cliente_id', clienteId)
      .order('data_visita', { ascending: false })
      .limit(1)
      .maybeSingle()

    const anteriores = (data?.codigos as { codigo: string; quantidade: number }[] | undefined) ?? []
    if (anteriores.length > 0) {
      setItens(anteriores.map((c) => ({ codigo: c.codigo, quantidade: c.quantidade })))
      toast.success(`${anteriores.length} item(ns) carregado(s) da última visita`)
    } else {
      toast('Nenhuma visita anterior encontrada')
    }
  }

  /** Persiste os dados do formulário sem navegar nem exibir toast de sucesso.
   * Retorna `{ id, numero }` em caso de sucesso, ou `null` em caso de erro. */
  const salvarDados = async (): Promise<{ id: string; numero: number | null } | null> => {
    if (!clienteId || !user) return null
    const vf = parseMoneyInput(valorFrete)
    const dp = parsePercentInput(descontoPercent)
    // Pedido/orçamento implicam visita bem-sucedida; status só é escolhido para tipo='visita'.
    const statusEfetivo: StatusVisita = tipoVisita === 'visita' ? status : 'visitado'

    if (isEditing && visitaId) {
      const { error } = await supabase
        .from('visitas')
        .update({
          data_visita: dataVisita,
          status: statusEfetivo,
          tipo_visita: tipoVisita,
          observacao: observacao.trim() || null,
          condicoes_pagamento: condicoesPagamento.trim() || null,
          valor_frete: vf,
          desconto_percent: dp,
        })
        .eq('id', visitaId)
      if (error) {
        toast.error('Erro ao salvar')
        return null
      }
      await supabase.from('visita_codigos').delete().eq('visita_id', visitaId)
      if (itens.length > 0) {
        await supabase.from('visita_codigos').insert(
          itens.map((i) => ({ visita_id: visitaId, codigo: i.codigo.trim(), quantidade: i.quantidade })),
        )
      }
      return { id: visitaId, numero: numeroPedido }
    }

    const payload = {
      cliente_id: clienteId,
      vendedor_id: user.id,
      data_visita: dataVisita,
      status: statusEfetivo,
      tipo_visita: tipoVisita,
      observacao: observacao.trim() || null,
      condicoes_pagamento: condicoesPagamento.trim() || null,
      // rota_execucao_id só é preenchido quando o acesso vem da execução de rota;
      // visitas registradas pela tela de clientes nunca interferem numa rota ativa.
      rota_execucao_id: execucaoId,
      valor_frete: vf,
      desconto_percent: dp,
    }
    const { data: visita, error } = await supabase
      .from('visitas')
      .insert(payload)
      .select('id, numero_pedido')
      .single()
    if (error || !visita) {
      toast.error('Erro ao registrar')
      return null
    }
    const novoId = visita.id as string
    const novoNumero = (visita as { numero_pedido?: number }).numero_pedido ?? null
    setNumeroPedido(novoNumero)
    if (itens.length > 0) {
      const { error: codErr } = await supabase.from('visita_codigos').insert(
        itens.map((i) => ({ visita_id: novoId, codigo: i.codigo.trim(), quantidade: i.quantidade })),
      )
      if (codErr) toast.error('Salvo, mas erro ao salvar itens')
    }
    return { id: novoId, numero: novoNumero }
  }

  const montarPdfBlob = async (id: string): Promise<Blob | null> => {
    const { data: row, error } = await supabase
      .from('visitas')
      .select(
        `
        *,
        cliente:clientes(*),
        codigos:visita_codigos(id, codigo, quantidade)
      `,
      )
      .eq('id', id)
      .single()
    if (error || !row) {
      toast.error('Erro ao carregar visita para o PDF')
      return null
    }
    const clienteBase = row.cliente as Cliente
    const { data: contatosData, error: contatosError } = await supabase
      .from('cliente_contatos')
      .select('id, cliente_id, tipo, valor, rotulo, ordem, criado_em')
      .eq('cliente_id', clienteBase.id)

    if (contatosError) {
      toast.error('Erro ao carregar contatos do cliente para o PDF')
    }

    const cliente: Cliente = {
      ...clienteBase,
      contatos: ((contatosData ?? []) as ClienteContato[]).sort((a, b) => {
        if (a.tipo === b.tipo) return a.ordem - b.ordem
        return a.tipo === 'telefone' ? -1 : 1
      }),
    }
    const codigos = (row.codigos as { codigo: string; quantidade: number }[]) ?? []
    const { data: produtosList } = await supabase.from('produtos').select('codigo, descricao, preco_tabela').eq('ativo', true)
    const produtosPorCodigo = new Map<string, ProdutoCatalogo>()
    for (const p of produtosList ?? []) {
      produtosPorCodigo.set(normCodigo(p.codigo), {
        codigo: p.codigo,
        descricao: p.descricao,
        preco_tabela: Number(p.preco_tabela),
      })
    }
    const vf = parseMoneyInput(valorFrete)
    const dp = parsePercentInput(descontoPercent)
    const np = (row as { numero_pedido?: number }).numero_pedido ?? 0
    const tipoDoc = ((row as { tipo_visita?: string }).tipo_visita as TipoVisita) ?? 'pedido'
    return buildPedidoPdfBlob({
      numeroPedido: np,
      dataEmissao: new Date((row as { data_visita: string }).data_visita + 'T12:00:00'),
      tipoVisita: tipoDoc === 'visita' ? 'pedido' : tipoDoc,
      cliente,
      visita: {
        condicoes_pagamento: row.condicoes_pagamento as string | null,
        observacao: row.observacao as string | null,
        valor_frete: vf,
        desconto_percent: dp,
      },
      codigos: codigos.map((c, i) => ({
        id: `tmp-${i}`,
        visita_id: id,
        codigo: c.codigo,
        quantidade: c.quantidade,
      })),
      produtosPorCodigo,
      vendedor: {
        nome: perfil?.nome ?? 'Vendedor',
        telefone: perfil?.telefone ?? null,
      },
    })
  }

  const handleExportarPdf = async () => {
    setExportando(true)
    try {
      const resultado = await salvarDados()
      if (!resultado) return
      const blob = await montarPdfBlob(resultado.id)
      if (!blob) return
      const np = resultado.numero ?? 0
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const prefixo = tipoVisita === 'orcamento' ? 'Orcamento' : 'Pedido'
      a.download = `${prefixo}_${np || resultado.id.slice(0, 8)}.pdf`
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Salvo e PDF gerado')
      if (!visitaId) navigateParaEdicao(resultado.id)
    } finally {
      setExportando(false)
    }
  }

  const handleEnviarCliente = async () => {
    setExportando(true)
    try {
      const resultado = await salvarDados()
      if (!resultado) return
      const blob = await montarPdfBlob(resultado.id)
      if (!blob) return
      const np = resultado.numero ?? 0
      const r = await compartilharOuBaixarPdf(blob, np, clienteTelefone)
      if (r === 'cancelled') return
      if (r === 'shared') toast.success('Compartilhamento aberto')
      else if (r === 'wa_opened') toast.success('PDF baixado — WhatsApp do cliente aberto; anexe o arquivo.')
      else toast.success('PDF baixado')
      if (!visitaId) navigateParaEdicao(resultado.id)
    } finally {
      setExportando(false)
    }
  }

  const enviarMercos = () => {
    const pedido = {
      cnpj: clienteCNPJ,
      comprador: clienteComprador,
      itens,
      condicoesPagamento,
      observacoes: observacao,
    }
    if (!podeEnviarMercos(pedido)) {
      toast.error('Preencha CNPJ do cliente e ao menos 1 item')
      return
    }
    window.open(linkMercosWhatsApp(pedido), '_blank', 'noopener')
  }

  const navigateParaEdicao = (id: string) => {
    if (execucaoId && clienteId) {
      navigate(`/rotas/execucao/${execucaoId}/visita/${clienteId}/${id}/editar`, { replace: true })
    } else if (clienteId) {
      navigate(`/clientes/${clienteId}/visita/${id}/editar`, { replace: true })
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!clienteId || !user) return
    setLoading(true)
    const resultado = await salvarDados()
    setLoading(false)
    if (!resultado) return
    toast.success(
      tipoVisita === 'orcamento'
        ? 'Orçamento salvo'
        : tipoVisita === 'visita'
        ? 'Visita registrada'
        : 'Pedido salvo',
    )
    if (isEditing) {
      navigate(-1)
    } else {
      navigateParaEdicao(resultado.id)
    }
  }

  const deletarVisita = async () => {
    if (!visitaId) return
    if (!confirm('Excluir esta visita? Esta ação não pode ser desfeita.')) return
    setDeletando(true)
    const { error } = await supabase.from('visitas').delete().eq('id', visitaId)
    setDeletando(false)
    if (error) {
      toast.error('Erro ao excluir')
      return
    }
    toast.success(
      tipoVisita === 'orcamento'
        ? 'Orçamento excluído'
        : tipoVisita === 'visita'
        ? 'Visita excluída'
        : 'Pedido excluído',
    )
    navigate(-1)
  }

  if (!visitLookupDone || loadingData) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  const canMercos = podeEnviarMercos({
    cnpj: clienteCNPJ,
    comprador: clienteComprador,
    itens,
    condicoesPagamento,
    observacoes: observacao,
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-8">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-gray-500">
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">
            {isEditing
              ? tipoVisita === 'orcamento'
                ? 'Editar Orçamento'
                : tipoVisita === 'visita'
                ? 'Editar Visita'
                : 'Editar Pedido'
              : tipoVisita === 'orcamento'
              ? 'Registrar Orçamento'
              : tipoVisita === 'visita'
              ? 'Registrar Visita'
              : 'Registrar Pedido'}
          </h2>
          {clienteNome && <p className="text-sm text-gray-500">{clienteNome}</p>}
          {numeroPedido != null && !isVisitaSimples && (
            <p className="mt-1 text-xs font-medium text-primary-700">
              {tipoVisita === 'orcamento' ? 'Orçamento' : 'Pedido'} nº {numeroPedido}
            </p>
          )}
        </div>
        {isEditing && (
          <button
            type="button"
            onClick={deletarVisita}
            disabled={deletando}
            className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-medium text-gray-600">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {(['pedido', 'orcamento', 'visita'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => setTipoVisita(tipo)}
                className={`rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                  tipoVisita === tipo
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {tipo === 'pedido' ? 'Pedido' : tipo === 'orcamento' ? 'Orçamento' : 'Visita'}
              </button>
            ))}
          </div>
          {isVisitaSimples && (
            <p className="mt-1 text-[11px] text-gray-400">
              Visita sem pedido/orçamento. Não consome número de pedido nem gera PDF.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Data da Visita</label>
          <input
            type="date"
            value={dataVisita}
            onChange={(e) => setDataVisita(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
          />
        </div>

        {isVisitaSimples && (
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-600">Resultado da visita</label>
            <div className="grid grid-cols-3 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`rounded-lg border-2 px-2 py-2.5 text-xs font-medium transition-all ${
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
        )}

        {!isVisitaSimples && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">Itens do Pedido</label>
              <button
                type="button"
                onClick={carregarUltimaVisita}
                className="flex items-center gap-1 text-xs font-medium text-primary-600"
              >
                <RotateCcw className="h-3 w-3" />
                Reaproveitar última
              </button>
            </div>
            <ChipInput itens={itens} onChange={setItens} onLookupCodigo={lookupCodigo} />
            <p className="mt-1 text-[11px] text-gray-400">
              Informe o código e a quantidade. Pressione Enter no código para ir à quantidade, e Enter novamente para adicionar.
            </p>
          </div>
        )}

        {!isVisitaSimples && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Condições de Pagamento</label>
            <input
              type="text"
              value={condicoesPagamento}
              onChange={(e) => setCondicoesPagamento(e.target.value)}
              maxLength={500}
              placeholder="Ex: 28/35/42 dias"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Observações</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
            placeholder="Detalhes do pedido, observações..."
          />
        </div>

        {!isVisitaSimples && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Valor do frete (opcional)</label>
              <input
                type="text"
                inputMode="decimal"
                value={valorFrete}
                onChange={(e) => setValorFrete(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Desconto % (opcional)</label>
              <input
                type="text"
                inputMode="decimal"
                value={descontoPercent}
                onChange={(e) => setDescontoPercent(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none"
              />
              <p className="mt-0.5 text-[11px] text-gray-400">Sobre o preço de tabela em cada item (0 a 100).</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <LoadingButton type="submit" loading={loading} className="w-full">
            {isEditing
              ? 'Salvar Alterações'
              : tipoVisita === 'orcamento'
              ? 'Salvar Orçamento'
              : tipoVisita === 'visita'
              ? 'Salvar Visita'
              : 'Salvar Pedido'}
          </LoadingButton>

          {!isVisitaSimples && (
            <>
              <button
                type="button"
                disabled={exportando || loading}
                onClick={() => void handleExportarPdf()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 disabled:opacity-50"
              >
                {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Exportar PDF do pedido
              </button>
              <button
                type="button"
                disabled={exportando || loading}
                onClick={() => void handleEnviarCliente()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary-600 bg-primary-50 px-4 py-3 text-sm font-medium text-primary-800 disabled:opacity-50"
              >
                <Share2 className="h-4 w-4" />
                Enviar ao cliente (PDF + WhatsApp)
              </button>

              <button
                type="button"
                onClick={enviarMercos}
                disabled={!canMercos}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-3 text-sm font-medium text-green-700 transition-colors active:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
              >
                <Send className="h-4 w-4" />
                Enviar pedido para Mercos (WhatsApp)
              </button>
              {!canMercos && (
                <p className="text-[11px] text-gray-400">
                  Para enviar: cliente precisa ter CNPJ cadastrado e ao menos 1 item.
                </p>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  )
}
