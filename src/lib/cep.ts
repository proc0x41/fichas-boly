interface DadosCEP {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

interface OpenCEPResponse {
  cep: string
  state: string
  city: string
  neighborhood: string
  street: string
}

export async function buscarCEP(cep: string): Promise<DadosCEP> {
  const cepOnly = cep.replace(/\D/g, '')
  if (cepOnly.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos')
  }

  const res = await fetch(`https://opencep.com/v1/${cepOnly}.json`)
  if (!res.ok) {
    throw new Error('CEP não encontrado')
  }

  const data: OpenCEPResponse = await res.json()

  if (!data) {
    throw new Error('CEP não encontrado')
  }

  return {
    logradouro: data.street || '',
    bairro: data.neighborhood || '',
    cidade: data.city || '',
    uf: data.state || '',
  }
}