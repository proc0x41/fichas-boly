interface DadosCEP {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

interface ViaCepResponse {
  cep?: string
  logradouro?: string
  complemento?: string
  bairro?: string
  localidade?: string
  uf?: string
  erro?: boolean | string
}

interface BrasilApiCepResponse {
  cep?: string
  state?: string
  city?: string
  neighborhood?: string
  street?: string
}

const FETCH_TIMEOUT = 8000 // 8 segundos

async function fetchWithTimeout(url: string, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function viaCep(cep: string): Promise<DadosCEP> {
  const res = await fetchWithTimeout(`https://viacep.com.br/ws/${cep}/json/`)
  if (!res.ok) throw new Error('CEP não encontrado')
  const data: ViaCepResponse = await res.json()
  if (data.erro) throw new Error('CEP não encontrado')
  return {
    logradouro: data.logradouro ?? '',
    bairro: data.bairro ?? '',
    cidade: data.localidade ?? '',
    uf: data.uf ?? '',
  }
}

async function brasilApiCep(cep: string): Promise<DadosCEP> {
  const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cep/v2/${cep}`)
  if (!res.ok) throw new Error('CEP não encontrado')
  const data: BrasilApiCepResponse = await res.json()
  return {
    logradouro: data.street ?? '',
    bairro: data.neighborhood ?? '',
    cidade: data.city ?? '',
    uf: data.state ?? '',
  }
}

export async function buscarCEP(cep: string): Promise<DadosCEP> {
  const cepOnly = cep.replace(/\D/g, '')
  if (cepOnly.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos')
  }

  try {
    return await viaCep(cepOnly)
  } catch {
    return await brasilApiCep(cepOnly)
  }
}