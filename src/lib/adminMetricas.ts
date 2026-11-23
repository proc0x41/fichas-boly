export interface ResumoMetricas {
  valor: number; pedidos: number; ticket: number; unidades: number; clientes: number
  frete: number; estimados: number; sem_preco: number
}
export interface ProdutoMetrica {
  codigo: string; descricao: string; quantidade: number; pedidos: number; valor: number
  participacao: number; estimados: number; sem_preco: number
}
export interface PontoMetrica { data: string; valor: number; pedidos: number }
export interface CategoriaMetrica {
  valor: number; unidades: number; pedidos: number; participacao: number
  estimados: number; sem_preco: number
}
export type CategoriasMetricas = Record<'boly' | 'importados', CategoriaMetrica>
export interface Metricas {
  inicio: string; fim: string; anterior_inicio: string; anterior_fim: string; agrupamento: 'dia' | 'mes'
  resumo: ResumoMetricas; anterior: ResumoMetricas; serie: PontoMetrica[]
  categorias?: CategoriasMetricas
  pendencias: { orcamentos: number; valor_orcamentos: number; frete_orcamentos: number
    estimados: number; sem_preco: number; nao_compartilhados: number; aguardando_nota: number }
  total_produtos: number; produtos: ProdutoMetrica[]
}
export type Periodo = 'hoje' | '7dias' | '30dias' | 'mes' | 'personalizado'
export type OrdemProduto = 'codigo' | 'descricao' | 'quantidade' | 'pedidos' | 'valor' | 'participacao'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function intervaloPeriodo(periodo: Periodo, hoje = new Date()) {
  const fim = iso(hoje)
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12)
  if (periodo === 'mes') inicio.setDate(1)
  if (periodo === '7dias') inicio.setDate(inicio.getDate() - 6)
  if (periodo === '30dias') inicio.setDate(inicio.getDate() - 29)
  return { inicio: iso(inicio), fim }
}
export function intervaloValido(inicio: string, fim: string) {
  const valido = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
    && v >= '1900-01-01' && v <= '9999-12-31'
    && iso(new Date(v + 'T12:00:00')) === v
  return valido(inicio) && valido(fim) && inicio <= fim
}
export const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
export const dataBr = (data: string) => data.split('-').reverse().join('/')
export function comparacao(atual: number, anterior: number) {
  if (anterior === 0) return 'Sem base de comparação'
  const variacao = (atual - anterior) / anterior * 100
  return `${variacao > 0 ? '+' : ''}${numero(variacao)}% em relação ao período anterior`
}
export function csvProdutos(produtos: ProdutoMetrica[], inicio: string, fim: string) {
  // Evita fórmulas ao abrir códigos/descrições não confiáveis no Excel.
  const celula = (v: string | number) => {
    const s = String(v)
    return `"${(/^[\s]*[=+\-@\t\r]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`
  }
  const linhas = [
    ['Período inicial', 'Período final', 'Código', 'Descrição', 'Quantidade', 'Pedidos', 'Valor após descontos (R$)', 'Participação (%)', 'Itens estimados', 'Itens sem preço'],
    ...produtos.map(p => [inicio, fim, p.codigo, p.descricao, p.quantidade, p.pedidos,
      p.valor.toFixed(2).replace('.', ','), p.participacao.toFixed(2).replace('.', ','), p.estimados, p.sem_preco]),
  ]
  return '\uFEFF' + linhas.map(l => l.map(celula).join(';')).join('\r\n')
}
