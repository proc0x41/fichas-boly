export function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function maskCEP(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.replace(/^(\d{5})(\d)/, '$1-$2')
}

export function maskTelefone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function maskIE(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits.match(/.{1,3}/g)?.join('.') ?? ''
}

export function unmask(value: string): string {
  return value.replace(/\D/g, '')
}

/** Remove acentuação para buscas case/accent-insensitive (cliente). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function validateCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')
  if (digits.length !== 14) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const calc = (size: number) => {
    let sum = 0
    let pos = size - 7
    for (let i = size; i >= 1; i--) {
      sum += parseInt(digits.charAt(size - i)) * pos--
      if (pos < 2) pos = 9
    }
    const result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
    return result
  }

  if (calc(12) !== parseInt(digits.charAt(12))) return false
  if (calc(13) !== parseInt(digits.charAt(13))) return false
  return true
}
