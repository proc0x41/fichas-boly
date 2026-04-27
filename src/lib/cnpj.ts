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