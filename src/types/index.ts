export interface Perfil {
  id: string
  user_id: string
  nome: string
  role: 'vendedor' | 'admin'
  must_change_password: boolean
  ativo: boolean
  criado_em: string
}

export interface Cliente {
  id: string
  vendedor_id: string
  fantasia: string
  razao_social: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  endereco: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  comprador: string | null
  dia_compras: string | null
  cliente_desde: string | null
  display_chao: number
  display_balcao: number
  display_parede: number
  total_itens: number
  ativo: boolean
  criado_em: string
  ultima_visita?: string | null
}

export type StatusVisita = 'pendente' | 'visitado' | 'nao_encontrado' | 'reagendado'

export interface Visita {
  id: string
  cliente_id: string
  vendedor_id: string
  data_visita: string
  status: StatusVisita
  observacao: string | null
  criado_em: string
  cliente?: Cliente
  codigos?: VisitaCodigo[]
}

export interface VisitaCodigo {
  id: string
  visita_id: string
  codigo: string
}

export interface Rota {
  id: string
  vendedor_id: string
  nome: string
  data_rota: string
  criado_em: string
  paradas?: RotaCliente[]
}

export interface RotaCliente {
  id: string
  rota_id: string
  cliente_id: string
  ordem: number
  visita_id: string | null
  cliente?: Cliente
  visita?: Visita
}
