/**
 * Corrige texto onde UTF-8 válido foi interpretado como Latin-1 (mojibake), ex.:
 * "aÃ§o" → "ação", "AlumÃ­nio" → "Alumínio".
 * Cada caractere (U+0000–U+00FF) vira um byte; o resultado é interpretado como UTF-8.
 */
export function fixUtf8Mojibake(input: string): string {
  if (!input) return input
  const bytes = new Uint8Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    if (c > 255) return input
    bytes[i] = c
  }
  const out = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (out.includes('\uFFFD')) return input
  return out
}

/** Aplica só quando há padrão típico (C2/C3 de UTF-8 lido como Latin-1) e todos os chars cabem em 1 byte. */
export function fixUtf8MojibakeIfNeeded(s: string): string {
  if (!s) return s
  if (!/[\u00c2\u00c3]/.test(s)) return s
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return s
  }
  const fixed = fixUtf8Mojibake(s)
  return fixed !== s ? fixed : s
}
