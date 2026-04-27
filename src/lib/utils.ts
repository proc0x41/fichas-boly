/** Normaliza código para comparação (trim + lowercase). */
export function normCodigo(c: string): string {
  return c.trim().toLowerCase()
}

/** Formata CNPJ com pontuação. */
export function formatCNPJ(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 14) return raw
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

/** Busca valor em objeto por múltiplos aliases (case-insensitive). */
export function getCell(row: Record<string, unknown>, ...aliases: string[]): string {
  const keys = Object.keys(row)
  for (const alias of aliases) {
    const a = alias.trim().toLowerCase()
    for (const k of keys) {
      if (k.trim().toLowerCase() === a) {
        const val = row[k]
        if (val === null || val === undefined) return ''
        return String(val).trim()
      }
    }
  }
  return ''
}

/** Parse preço não-negativo a partir de string/número. */
export function parsePreco(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null
  if (typeof v === 'number' && !Number.isNaN(v)) return v >= 0 ? v : null
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Parse percentual 0–100. */
export function parsePercentInput(s: string): number {
  const t = String(s).trim().replace(/\s/g, '').replace('%', '').replace(',', '.')
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(100, n)
}

/** Parse valor monetário não-negativo. */
export function parseMoneyInput(s: string): number {
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
