/** Dígitos com DDI 55 para wa.me */
export function telefoneParaWaMe(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null
  const d = telefone.replace(/\D/g, '')
  if (d.length < 10) return null
  const com55 = d.startsWith('55') ? d : `55${d}`
  return com55
}

export function nomeArquivoPedido(numeroPedido: number): string {
  return `Pedido_${numeroPedido}.pdf`
}

export async function compartilharOuBaixarPdf(
  blob: Blob,
  numeroPedido: number,
  telefoneCliente: string | null | undefined,
): Promise<'shared' | 'downloaded' | 'wa_opened' | 'cancelled'> {
  const file = new File([blob], nomeArquivoPedido(numeroPedido), { type: 'application/pdf' })

  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Pedido ${numeroPedido}`,
        text: 'Segue o pedido em PDF.',
      })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivoPedido(numeroPedido)
  a.click()
  URL.revokeObjectURL(url)

  const wa = telefoneParaWaMe(telefoneCliente)
  if (wa) {
    const text = encodeURIComponent(
      `Olá! Segue o pedido nº ${numeroPedido} em anexo (arquivo ${nomeArquivoPedido(numeroPedido)}).`,
    )
    window.open(`https://wa.me/${wa}?text=${text}`, '_blank', 'noopener')
    return 'wa_opened'
  }

  return 'downloaded'
}
