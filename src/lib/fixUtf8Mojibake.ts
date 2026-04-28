/**
 * Corrige texto onde UTF-8 válido foi interpretado como Latin-1 (mojibake).
 * Ex: "aÃ§o" → "ação", "AlumÃ­nio" → "Alumínio".
 * Se não houver padrão típico de mojibake, retorna o texto original.
 */
export function fixUtf8MojibakeIfNeeded(s: string): string {
  if (!s || s.length > 10000) return s
  
  // Verifica se há padrão típico de UTF-8 lido como Latin-1 (C2/C3)
  if (!/[\u00c2\u00c3]/.test(s)) return s
  
  // Verifica se todos os caracteres cabem em 1 byte (Latin-1)
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 255) return s
  }
  
  // Converte cada caractere para byte e interpreta como UTF-8
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i)
  }
  
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  
  // Se contém caractere de substituição, o texto original está correto
  if (decoded.includes('\uFFFD')) return s
  
  return decoded !== s ? decoded : s
}
