import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { LoadingButton } from '../../components/LoadingButton'
import { ArrowLeft, Loader2, CheckCircle2, RotateCcw, Phone, Mail, User, FileDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatarDataBr, normCodigo, formatCNPJ } from '../../lib/utils'
import { maskCEP, maskTelefone } from '../../lib/masks'
import { buildPedidoPdfBlob, type ProdutoCatalogo } from '../../lib/pedidoPdf'
import { baixarPdf, nomeArquivoPedido } from '../../lib/sharePedido'
import type { Cliente, ClienteContato } from '../../types'

interface ItemRow {
  codigo: string
  descricao: string | null
  quantidade: number
  preco: number
  pctEfetivo: number
  precoLiquido: number
  subtotal: number
}

interface PedidoFull {
  id: string
  numero_pedido: number | null
  data_visita: string
  compartilhado_em: string
  nota_emitida_em: string | null
  condicoes_pagamento: string | null
  observacao: string | null
  desconto_percent: number
  valor_frete: number
  vendedor_id: string
  vendedor_nome: string
  vendedor_telefone: string | null
  cliente: Cliente
  contatos: ClienteContato[]
  itens: ItemRow[]
  /** Dados crus dos códigos preservados pra alimentar o gerador de PDF. */
  codigosRaw: { codigo: string; quantidade: number; desconto_percent_override: number | null }[]
  /** Catálogo de produtos indexado pelo código normalizado (para o PDF). */
  produtosPorCodigo: Map<string, ProdutoCatalogo>
  totais: {
    subtotal: number
    desconto: number
    frete: number
    total: number
    qtdItens: number
    temOverride: boolean
  }
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDateTime = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export default function RepresentadaPedidoDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState<PedidoFull | null>(null)
  const [loading, setLoading] = useState(true)
  const [marcando, setMarcando] = useState(false)
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data: visita, error } = await supabase
        .from('visitas')
        .select(
          `id, numero_pedido, data_visita, compartilhado_em, nota_emitida_em,
           condicoes_pagamento, observacao, desconto_percent, valor_frete, vendedor_id,
           cliente:clientes(*),
           codigos:visita_codigos(codigo, quantidade, desconto_percent_override)`,
        )
        .eq('id', id)
        .single()

      if (cancelled) return

      if (error || !visita) {
        toast.error('Pedido não encontrado ou não compartilhado')
        navigate('/representada', { replace: true })
        return
      }

      // PostgREST retorna cliente como objeto via embed; o tipo gerado às vezes
      // é inferido como array. Cast via unknown para destravar.
      const clienteRow = (visita as unknown as { cliente: Cliente | null }).cliente
      if (!clienteRow) {
        toast.error('Erro ao carregar cliente')
        navigate('/representada', { replace: true })
        return
      }

      const [{ data: contatosData }, { data: produtosList }, { data: perfilVendedor }] = await Promise.all([
        supabase
          .from('cliente_contatos')
          .select('id, cliente_id, tipo, valor, rotulo, ordem, criado_em')
          .eq('cliente_id', clienteRow.id),
        supabase.from('produtos').select('codigo, descricao, preco_tabela').eq('ativo', true),
        supabase
          .from('perfis')
          .select('nome, telefone')
          .eq('user_id', (visita as { vendedor_id: string }).vendedor_id)
          .maybeSingle(),
      ])

      if (cancelled) return

      const contatos = ((contatosData ?? []) as ClienteContato[]).slice().sort((a, b) => {
        if (a.tipo === b.tipo) return a.ordem - b.ordem
        return a.tipo === 'telefone' ? -1 : 1
      })

      const produtosPorCodigo = new Map<string, ProdutoCatalogo>()
      for (const p of produtosList ?? []) {
        produtosPorCodigo.set(normCodigo(p.codigo as string), {
          codigo: p.codigo as string,
          descricao: p.descricao as string,
          preco_tabela: Number(p.preco_tabela),
        })
      }

      const desc = Number((visita as { desconto_percent: number | null }).desconto_percent ?? 0)
      const frete = Number((visita as { valor_frete: number | null }).valor_frete ?? 0)
      const codigos =
        ((visita as {
          codigos: { codigo: string; quantidade: number; desconto_percent_override: number | null }[]
        }).codigos ?? [])

      let subtotal = 0
      let totalLiquido = 0
      let temOverride = false
      const itens: ItemRow[] = codigos.map((c) => {
        const prod = produtosPorCodigo.get(normCodigo(c.codigo))
        const preco = prod?.preco_tabela ?? 0
        const override = c.desconto_percent_override
        const pctEfetivo =
          override !== null && override !== undefined ? Number(override) : desc
        if (override !== null && override !== undefined && Number(override) !== desc) {
          temOverride = true
        }
        const fator = 1 - pctEfetivo / 100
        const precoLiquido = preco * fator
        const sub = precoLiquido * c.quantidade
        subtotal += preco * c.quantidade
        totalLiquido += sub
        return {
          codigo: c.codigo,
          descricao: prod?.descricao ?? null,
          quantidade: c.quantidade,
          preco,
          pctEfetivo,
          precoLiquido,
          subtotal: sub,
        }
      })

      setPedido({
        id: visita.id as string,
        numero_pedido: (visita as { numero_pedido: number | null }).numero_pedido ?? null,
        data_visita: visita.data_visita as string,
        compartilhado_em: (visita as { compartilhado_em: string }).compartilhado_em,
        nota_emitida_em: (visita as { nota_emitida_em: string | null }).nota_emitida_em ?? null,
        condicoes_pagamento: (visita as { condicoes_pagamento: string | null }).condicoes_pagamento ?? null,
        observacao: (visita as { observacao: string | null }).observacao ?? null,
        desconto_percent: desc,
        valor_frete: frete,
        vendedor_id: (visita as { vendedor_id: string }).vendedor_id,
        vendedor_nome: perfilVendedor?.nome ?? '—',
        vendedor_telefone: perfilVendedor?.telefone ?? null,
        cliente: { ...clienteRow, contatos },
        contatos,
        itens,
        codigosRaw: codigos,
        produtosPorCodigo,
        totais: {
          subtotal,
          desconto: Math.max(0, subtotal - totalLiquido),
          frete,
          total: totalLiquido + frete,
          qtdItens: itens.reduce((s, i) => s + i.quantidade, 0),
          temOverride,
        },
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const handleExportarPdf = async () => {
    if (!pedido) return
    setExportando(true)
    try {
      const blob = buildPedidoPdfBlob({
        numeroPedido: pedido.numero_pedido ?? 0,
        // Data do pedido em fuso BR (T12:00:00 evita o salto pra dia anterior em UTC-3).
        dataEmissao: new Date(pedido.data_visita + 'T12:00:00'),
        tipoVisita: 'pedido',
        cliente: pedido.cliente,
        visita: {
          condicoes_pagamento: pedido.condicoes_pagamento,
          observacao: pedido.observacao,
          valor_frete: pedido.valor_frete,
          desconto_percent: pedido.desconto_percent,
        },
        codigos: pedido.codigosRaw.map((c, i) => ({
          id: `tmp-${i}`,
          visita_id: pedido.id,
          codigo: c.codigo,
          quantidade: c.quantidade,
          desconto_percent_override:
            c.desconto_percent_override !== null && c.desconto_percent_override !== undefined
              ? Number(c.desconto_percent_override)
              : null,
        })),
        produtosPorCodigo: pedido.produtosPorCodigo,
        vendedor: {
          nome: pedido.vendedor_nome,
          telefone: pedido.vendedor_telefone,
        },
      })
      baixarPdf(
        blob,
        nomeArquivoPedido(pedido.numero_pedido ?? pedido.id.slice(0, 8), 'pedido'),
      )
      toast.success('PDF gerado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar PDF')
    } finally {
      setExportando(false)
    }
  }

  const marcarToggle = async () => {
    if (!pedido) return
    setMarcando(true)
    const querMarcar = !pedido.nota_emitida_em
    const { error } = await supabase.rpc('marcar_nota_emitida', {
      p_visita_id: pedido.id,
      p_marcar: querMarcar,
    })
    setMarcando(false)
    if (error) {
      toast.error(error.message ?? 'Erro ao atualizar status')
      return
    }
    setPedido((p) =>
      p ? { ...p, nota_emitida_em: querMarcar ? new Date().toISOString() : null } : p,
    )
    toast.success(querMarcar ? 'Marcado como NF emitida' : 'Status revertido para pendente')
  }

  const telefones = useMemo(
    () => pedido?.contatos.filter((c) => c.tipo === 'telefone' && c.valor.trim()) ?? [],
    [pedido],
  )
  const emails = useMemo(
    () => pedido?.contatos.filter((c) => c.tipo === 'email' && c.valor.trim()) ?? [],
    [pedido],
  )

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!pedido) return null

  const enderecoFmt = [
    [pedido.cliente.endereco, pedido.cliente.numero].filter(Boolean).join(', '),
    pedido.cliente.bairro,
    [pedido.cliente.cidade, pedido.cliente.estado].filter(Boolean).join(' / '),
    pedido.cliente.cep ? `CEP ${maskCEP(pedido.cliente.cep)}` : null,
  ]
    .filter(Boolean)
    .join(' — ')

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 pb-8">
      <button
        onClick={() => navigate('/representada')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </button>

      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">
            Pedido {pedido.numero_pedido != null && `nº ${pedido.numero_pedido}`}
          </h2>
          <p className="text-sm text-gray-500">{formatarDataBr(pedido.data_visita)}</p>
          <p className="mt-1 text-[11px] text-gray-400">
            Compartilhado em {fmtDateTime(pedido.compartilhado_em)}
          </p>
        </div>
        {pedido.nota_emitida_em ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            NF emitida
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Pendente
          </span>
        )}
      </div>

      {/* Cliente */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Cliente
        </h3>
        <p className="text-sm font-semibold text-gray-900">
          {pedido.cliente.razao_social ?? pedido.cliente.fantasia}
        </p>
        {pedido.cliente.razao_social && pedido.cliente.fantasia && (
          <p className="text-xs text-gray-500">Nome fantasia: {pedido.cliente.fantasia}</p>
        )}
        {pedido.cliente.cnpj && (
          <p className="text-xs text-gray-600">CNPJ: {formatCNPJ(pedido.cliente.cnpj)}</p>
        )}
        {pedido.cliente.inscricao_estadual && (
          <p className="text-xs text-gray-600">IE: {pedido.cliente.inscricao_estadual}</p>
        )}
        {enderecoFmt && <p className="mt-1 text-xs text-gray-600">{enderecoFmt}</p>}
        {pedido.cliente.comprador && (
          <p className="mt-1 text-xs text-gray-600">Comprador: {pedido.cliente.comprador}</p>
        )}
        {(telefones.length > 0 || emails.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {telefones.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 text-xs text-gray-600">
                <Phone className="h-3 w-3" />
                {maskTelefone(t.valor)}
                {t.rotulo && <span className="text-gray-400">({t.rotulo})</span>}
              </span>
            ))}
            {emails.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1 text-xs text-gray-600">
                <Mail className="h-3 w-3" />
                {e.valor}
                {e.rotulo && <span className="text-gray-400">({e.rotulo})</span>}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Vendedor */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Vendedor
        </h3>
        <p className="flex items-center gap-1.5 text-sm text-gray-900">
          <User className="h-4 w-4 text-gray-400" />
          {pedido.vendedor_nome}
          {pedido.vendedor_telefone && (
            <span className="text-xs text-gray-500">· {pedido.vendedor_telefone}</span>
          )}
        </p>
      </section>

      {/* Itens */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Itens ({pedido.itens.length})
        </h3>
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-2 py-1.5">Cód.</th>
                <th className="px-2 py-1.5">Descrição</th>
                <th className="px-2 py-1.5 text-right">Qtd</th>
                <th className="px-2 py-1.5 text-right">P. tab.</th>
                <th className="px-2 py-1.5 text-right">Desc.</th>
                <th className="px-2 py-1.5 text-right">P. líq.</th>
                <th className="px-2 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pedido.itens.map((it, idx) => (
                <tr key={`${it.codigo}-${idx}`} className="text-gray-700">
                  <td className="px-2 py-1.5 font-mono">{it.codigo}</td>
                  <td className="px-2 py-1.5">
                    {it.descricao ?? <span className="text-amber-700">Não cadastrado</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{it.quantidade}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtBRL(it.preco)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {it.pctEfetivo.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtBRL(it.precoLiquido)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                    {fmtBRL(it.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Resumo */}
      <section className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <dt>Subtotal (tabela)</dt>
            <dd className="tabular-nums">{fmtBRL(pedido.totais.subtotal)}</dd>
          </div>
          {pedido.totais.desconto > 0 && (
            <div className="flex justify-between text-red-600">
              <dt>
                {pedido.totais.temOverride
                  ? 'Desconto (com overrides por item)'
                  : `Desconto (${pedido.desconto_percent.toLocaleString('pt-BR', {
                      maximumFractionDigits: 2,
                    })}%)`}
              </dt>
              <dd className="tabular-nums">- {fmtBRL(pedido.totais.desconto)}</dd>
            </div>
          )}
          {pedido.totais.frete > 0 && (
            <div className="flex justify-between text-gray-600">
              <dt>Frete</dt>
              <dd className="tabular-nums">{fmtBRL(pedido.totais.frete)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900">
            <dt>Total</dt>
            <dd className="tabular-nums text-primary-700">{fmtBRL(pedido.totais.total)}</dd>
          </div>
        </dl>
      </section>

      {/* Condições / Observações */}
      {(pedido.condicoes_pagamento || pedido.observacao) && (
        <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
          {pedido.condicoes_pagamento && (
            <p className="text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Condições de pagamento:{' '}
              </span>
              {pedido.condicoes_pagamento}
            </p>
          )}
          {pedido.observacao && (
            <p className="mt-1 text-sm whitespace-pre-line">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Observações:{' '}
              </span>
              {pedido.observacao}
            </p>
          )}
        </section>
      )}

      {/* Botão principal */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] space-y-2">
        <button
          type="button"
          disabled={exportando}
          onClick={() => void handleExportarPdf()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 transition-colors active:bg-gray-50 disabled:opacity-50"
        >
          {exportando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          Baixar PDF do pedido
        </button>
        {pedido.nota_emitida_em ? (
          <>
            <p className="mb-2 text-center text-xs text-gray-500">
              Marcada como emitida em {fmtDateTime(pedido.nota_emitida_em)}
            </p>
            <LoadingButton
              variant="secondary"
              loading={marcando}
              onClick={marcarToggle}
              className="w-full"
            >
              <RotateCcw className="h-4 w-4" />
              Reverter para pendente
            </LoadingButton>
          </>
        ) : (
          <button
            type="button"
            disabled={marcando}
            onClick={marcarToggle}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
          >
            {marcando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-5 w-5" />
            )}
            Marcar Nota Emitida
          </button>
        )}
      </div>
    </div>
  )
}
