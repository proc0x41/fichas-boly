interface DadosCNPJ {
  razaoSocial: string
  nomeFantasia: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
}

interface BrasilApiCnpjResponse {
  razao_social?: string
  nome_fantasia?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  ddd_telefone_1?: string
  ddd_telefone_2?: string
  email?: string
  message?: string
}

interface OpenCnpjResponse {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  municipio?: string
  uf?: string
  cep?: string
  email?: string
  telefones?: Array<{ ddd?: string; numero?: string; is_fax?: boolean }>
  message?: string
}

function formatTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 10) return digits
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`
}

function formatCEP(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 8) return raw
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

async function buscarBrasilAPI(cnpj: string): Promise<DadosCNPJ> {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
  if (!res.ok) {
    throw new Error('CNPJ não encontrado')
  }
  const data: BrasilApiCnpjResponse = await res.json()
  if (!data.razao_social) {
    throw new Error(data.message || 'CNPJ não encontrado')
  }
  return {
    razaoSocial: data.razao_social ?? '',
    nomeFantasia: data.nome_fantasia ?? '',
    logradouro: data.logradouro ?? '',
    numero: data.numero ?? '',
    complemento: data.complemento ?? '',
    bairro: data.bairro ?? '',
    municipio: data.municipio ?? '',
    uf: data.uf ?? '',
    cep: data.cep ? formatCEP(data.cep) : '',
    telefone: data.ddd_telefone_1 ? formatTelefone(data.ddd_telefone_1) : '',
    email: data.email ?? '',
  }
}

async function buscarOpenCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const res = await fetch(`https://api.opencnpj.org/${cnpj}`)
  if (!res.ok) {
    throw new Error('CNPJ não encontrado')
  }
  const data: OpenCnpjResponse = await res.json()
  if (!data.razao_social) {
    throw new Error(data.message || 'CNPJ não encontrado')
  }
  const tel = data.telefones?.find((t) => !t.is_fax) ?? data.telefones?.[0]
  const telefoneRaw = tel ? `${tel.ddd ?? ''}${tel.numero ?? ''}` : ''
  return {
    razaoSocial: data.razao_social ?? '',
    nomeFantasia: data.nome_fantasia ?? '',
    logradouro: data.logradouro ?? '',
    numero: data.numero ?? '',
    complemento: data.complemento ?? '',
    bairro: data.bairro ?? '',
    municipio: data.municipio ?? '',
    uf: data.uf ?? '',
    cep: data.cep ? formatCEP(data.cep) : '',
    telefone: telefoneRaw ? formatTelefone(telefoneRaw) : '',
    email: data.email ?? '',
  }
}

export async function buscarCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const cnpjOnly = cnpj.replace(/\D/g, '')
  if (cnpjOnly.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos')
  }

  try {
    return await buscarBrasilAPI(cnpjOnly)
  } catch (err1) {
    try {
      return await buscarOpenCNPJ(cnpjOnly)
    } catch (err2) {
      const msg =
        err2 instanceof Error
          ? err2.message
          : err1 instanceof Error
            ? err1.message
            : 'CNPJ não encontrado'
      throw new Error(msg)
    }
  }
}
interface DadosCNPJ {
  razaoSocial: string
  nomeFantasia: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  telefone: string
  email: string
}

interface OpenCNPJResponse {
  success: boolean
  message: string | null
  data: {
    cnpj: string
    situacaoCadastral: string
    razaoSocial: string
    nomeFantasia: string
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    municipio: string
    uf: string
    cep: string
    telefone: string
    email: string
  } | null
}

export async function buscarCNPJ(cnpj: string): Promise<DadosCNPJ> {
  const cnpjOnly = cnpj.replace(/\D/g, '')
  if (cnpjOnly.length !== 14) {
    throw new Error('CNPJ deve ter 14 dígitos')
  }

  const hosts = [
    'https://api.opencnpj.com',
    'https://opencnpj.com/v1',
  ]

  let lastError: Error | null = null

  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/${cnpjOnly}`)
      if (!res.ok) {
        throw new Error('CNPJ não encontrado')
      }

      const data: OpenCNPJResponse = await res.json()

      if (!data.success || !data.data) {
        throw new Error(data.message || 'CNPJ não encontrado')
      }

      const d = data.data

      return {
        razaoSocial: d.razaoSocial || '',
        nomeFantasia: d.nomeFantasia || '',
        logradouro: d.logradouro || '',
        numero: d.numero || '',
        complemento: d.complemento || '',
        bairro: d.bairro || '',
        municipio: d.municipio || '',
        uf: d.uf || '',
        cep: d.cep || '',
        telefone: d.telefone || '',
        email: d.email || '',
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Erro ao buscar CNPJ')
    }
  }

  throw lastError || new Error('CNPJ não encontrado')
}