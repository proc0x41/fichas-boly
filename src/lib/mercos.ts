import type { CodigoItem } from '../types'

const MERCOS_PHONE = '551140401847'
const REPRESENTADA = 'Boly Comércio e Indústria de Encartelados LTDA - EPP'

export interface PedidoMercos {
  cnpj: string | null
  /** Nome do comprador no cliente — enviado para a IA da Mercos no WhatsApp */
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

export function mensagemPedidoMercos(pedido: PedidoMercos): string {
  const linhas: string[] = []

  const cnpjFormatado = formatCNPJ(pedido.cnpj)
  linhas.push(`CNPJ: ${cnpjFormatado ?? '—'}`)
  const comprador = pedido.comprador?.trim()
  if (comprador) {
    linhas.push(`Comprador: ${comprador}`)
  }
  linhas.push(`O pedido é para a representada ${REPRESENTADA}`)

  if (pedido.itens.length > 0) {
    // Formato compacto em uma linha (padrão pedido Mercos).
    // Ex: "Códigos: COD1 x 10, COD2 x 5"
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

export function linkMercosWhatsApp(pedido: PedidoMercos): string {
  const texto = mensagemPedidoMercos(pedido)
  return `https://wa.me/${MERCOS_PHONE}?text=${encodeURIComponent(texto)}`
}

export function podeEnviarMercos(pedido: PedidoMercos): boolean {
  return Boolean(pedido.cnpj) && pedido.itens.length > 0
}
