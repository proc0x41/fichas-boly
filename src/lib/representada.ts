import type { CodigoItem } from '../types'

const REPRESENTADA_PHONE = '551140401847'
const REPRESENTADA = 'Boly Comércio e Indústria de Encartelados LTDA - EPP'

export interface PedidoRepresentada {
  cnpj: string | null
  /** Nome do comprador no cliente — enviado no WhatsApp da Representada */
  comprador: string | null
  itens: CodigoItem[]
  condicoesPagamento: string | null
  observacoes: string | null
}

function formatCNPJ(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 14) return raw
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function mensagemPedidoRepresentada(pedido: PedidoRepresentada): string {
  const linhas: string[] = []

  const cnpjFormatado = formatCNPJ(pedido.cnpj)
  linhas.push(`CNPJ: ${cnpjFormatado ?? '—'}`)
  const comprador = pedido.comprador?.trim()
  if (comprador) {
    linhas.push(`Comprador: ${comprador}`)
  }
  linhas.push(`O pedido é para a representada ${REPRESENTADA}`)

  if (pedido.itens.length > 0) {
    const itensStr = pedido.itens
      .map((i) => `${i.codigo} x ${i.quantidade}`)
      .join(', ')
    linhas.push(`Códigos: ${itensStr}`)
  }

  if (pedido.condicoesPagamento?.trim()) {
    linhas.push(`Condições de Pagamento: ${pedido.condicoesPagamento.trim()}`)
  }

  if (pedido.observacoes?.trim()) {
    linhas.push(`Observações: ${pedido.observacoes.trim()}`)
  }

  return linhas.join('\n')
}

export function linkRepresentadaWhatsApp(pedido: PedidoRepresentada): string {
  const texto = mensagemPedidoRepresentada(pedido)
  return `https://wa.me/${REPRESENTADA_PHONE}?text=${encodeURIComponent(texto)}`
}

export function podeEnviarRepresentada(pedido: PedidoRepresentada): boolean {
  return Boolean(pedido.cnpj) && pedido.itens.length > 0
}
