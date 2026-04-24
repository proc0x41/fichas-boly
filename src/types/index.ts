export interface Perfil {
  id: string
  user_id: string
  nome: string
  role: 'vendedor' | 'admin'
  must_change_password: boolean
  ativo: boolean
  ciclo_dias: number
  /** Se definido, a checklist só considera conclusões com `finalizada_em` depois deste instante (nova rodada). */
  lista_rodada_desde: string | null
  telefone: string | null
  criado_em: string
}

export interface Produto {
  id: string
  codigo: string
  descricao: string
  preco_tabela: number
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface ClienteContato {
  id: string
  cliente_id: string
  tipo: 'telefone' | 'email'
  valor: string
  rotulo: string | null
  ordem: number
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
  estado: string | null
  cep: string | null
  /** @deprecated use cliente_contatos */
  telefone: string | null
  /** @deprecated use cliente_contatos */
  email: string | null
  comprador: string | null
  dia_compras: string | null
  cliente_desde: string | null
  /** true = cliente ativo, false = prospect */
  is_cliente: boolean
  display_chao: number
  display_balcao: number
  display_parede: number
  total_itens: number
  ativo: boolean
  criado_em: string
  ultima_visita?: string | null
  contatos?: ClienteContato[]
}

export type StatusVisita = 'pendente' | 'visitado' | 'nao_encontrado' | 'reagendado'

export interface Visita {
  id: string
  cliente_id: string
  vendedor_id: string
  data_visita: string
  status: StatusVisita
  observacao: string | null
  condicoes_pagamento: string | null
  rota_execucao_id: string | null
  numero_pedido?: number
  valor_frete?: number
  /** Desconto único do pedido em % sobre preço de tabela (0–100). */
  desconto_percent?: number
  criado_em: string
  cliente?: Cliente
  codigos?: VisitaCodigo[]
}

export interface VisitaCodigo {
  id: string
  visita_id: string
  codigo: string
  quantidade: number
}

export interface CodigoItem {
  codigo: string
  quantidade: number
}

export interface Rota {
  id: string
  vendedor_id: string
  nome: string
  ordem: number
  ativo: boolean
  criado_em: string
  paradas?: RotaCliente[]
}

export interface RotaCliente {
  id: string
  rota_id: string
  cliente_id: string
  ordem: number
  cliente?: Cliente
}

export interface RotaExecucao {
  id: string
  rota_id: string
  vendedor_id: string
  iniciada_em: string
  finalizada_em: string | null
  rota?: Rota
}
