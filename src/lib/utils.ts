/** Normaliza código para comparação (trim + lowercase). */
export function normCodigo(c: string): string {
  return c.trim().toLowerCase()
}
/**
 * Compara dois códigos de produto para ordenação crescente.
 *
 * Usa `localeCompare` com `numeric: true` para ordenação natural (ex.: "2"
 * antes de "10") e `sensitivity: 'base'` para ignorar caixa/acentuação —
 * espelha o índice único do banco (`lower(trim(codigo))` em `produtos`).
 *
 * Usado para apresentar os códigos de um pedido/orçamento em ordem crescente.
 */
export function compararCodigos(a: string, b: string): number {
  return a.trim().toLowerCase().localeCompare(b.trim().toLowerCase(), 'pt-BR', {
    numeric: true,
    sensitivity: 'base',
  })
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

/**
 * Retorna a data de hoje no fuso local como `YYYY-MM-DD`.
 *
 * Why: `new Date().toISOString().split('T')[0]` retorna a data em UTC, então
 * vendedores em UTC-3 entre 21:00 e 23:59 gravariam a visita com data do dia
 * seguinte.
 */
export function dataLocalIso(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/**
 * Formata uma data (string `'YYYY-MM-DD'` ou Date) para `'dd/mm/aaaa'` em pt-BR.
 *
 * Why: `new Date('YYYY-MM-DD')` é interpretado como UTC midnight; em UTC-3 o
 * `toLocaleDateString` mostra o dia anterior. Forçamos meio-dia local antes de
 * formatar para neutralizar o offset.
 */
export function formatarDataBr(value: string | Date | null | undefined): string {
  if (!value) return ''
  if (value instanceof Date) return value.toLocaleDateString('pt-BR')
  const s = value.length >= 10 ? value.slice(0, 10) : value
  return new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR')
}
