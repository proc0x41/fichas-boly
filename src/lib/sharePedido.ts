import type { TipoVisita } from '../types'

/** Retorna o nome do arquivo PDF (Pedido_X.pdf ou Orcamento_X.pdf). */
export function nomeArquivoPedido(numeroPedido: number | string, tipo: TipoVisita = 'pedido'): string {
  const prefixo = tipo === 'orcamento' ? 'Orcamento' : 'Pedido'
  return `${prefixo}_${numeroPedido}.pdf`
}

/** Dispara o download do blob como arquivo. */
export function baixarPdf(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Tamanho máximo seguro do `body` em mailto:. Outlook (desktop) corta URLs longas
 * em torno de 2000 caracteres; ficamos abaixo disso já considerando overhead do
 * percent-encoding e do prefixo `mailto:?subject=...&body=`.
 */
const MAILTO_BODY_MAX = 1500

/** Trunca o corpo se ultrapassar o limite seguro do mailto, anexando reticências. */
export function truncarBodyEmail(body: string): string {
  if (body.length <= MAILTO_BODY_MAX) return body
  return body.slice(0, MAILTO_BODY_MAX - 3).trimEnd() + '...'
}

/** Constrói um link `mailto:` com assunto e corpo já preenchidos. */
export function linkEmail({
  to,
  subject,
  body,
}: {
  to: string
  subject: string
  body: string
}): string {
  const params = new URLSearchParams()
  params.set('subject', subject)
  params.set('body', truncarBodyEmail(body))
  // URLSearchParams usa '+' para espaço; mailto: padrão usa '%20'.
  const qs = params.toString().replace(/\+/g, '%20')
  return `mailto:${encodeURIComponent(to)}?${qs}`
}

/**
 * Normaliza um telefone BR para o formato esperado pelo wa.me:
 * apenas dígitos, com DDI 55 prefixado. Retorna `null` se não houver
 * dígitos suficientes (mínimo 10 = DDD + número).
 */
export function telefoneParaWaMe(telefone: string | null | undefined): string | null {
  if (!telefone?.trim()) return null
  const d = telefone.replace(/\D/g, '')
  if (d.length < 10) return null
  return d.startsWith('55') ? d : `55${d}`
}

/**
 * Constrói um link `https://wa.me/...` com texto pré-preenchido. Retorna
 * `null` se o telefone for inválido (chamador deve mostrar erro ao usuário).
 */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const num = telefoneParaWaMe(telefone)
  if (!num) return null
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}

interface ShareDataComArquivos extends ShareData {
  files?: File[]
}

interface NavigatorShareWithFiles {
  canShare?: (data: ShareDataComArquivos) => boolean
  share?: (data: ShareDataComArquivos) => Promise<void>
}

/**
 * Navegadores (tipicamente PWAs/mobile) que suportam a Web Share API com arquivos
 * permitem enviar o PDF direto para e-mail/WhatsApp sem precisar baixar antes.
 */
export function podeCompartilharArquivo(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as unknown as NavigatorShareWithFiles
  return typeof nav.canShare === 'function' && typeof nav.share === 'function'
}

/**
 * Compartilha o PDF gerado pela Web Share API, já com o arquivo anexado.
 * Resolve o fluxo "enviar PDF sem baixar antes". Em navegadores sem suporte,
 * retorna false para que o chamador use o fallback (download + mailto:).
 */
export async function compartilharPdfArquivo(
  blob: Blob,
  nomeArquivo: string,
  opcoes: { titulo?: string; texto?: string } = {},
): Promise<boolean> {
  if (!podeCompartilharArquivo()) return false
  const nav = navigator as unknown as NavigatorShareWithFiles
  const file = new File([blob], nomeArquivo, { type: 'application/pdf' })
  const data: ShareDataComArquivos = {
    title: opcoes.titulo,
    text: opcoes.texto,
    files: [file],
  }
  try {
    if (!nav.canShare!(data)) return false
    await nav.share!(data)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return true
    return false
  }
}
