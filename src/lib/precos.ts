/** Mesma regra da RPC: preço salvo, catálogo como estimativa, desconto zero explícito. */
export function valorLinha(
  quantidade: number, historico: number | null | undefined, catalogo: number | null | undefined,
  global: number, override?: number | null,
) {
  const preco = historico ?? catalogo
  const desconto = override ?? global
  const bruto = (preco ?? 0) * quantidade
  return {
    preco: preco ?? 0,
    desconto,
    bruto,
    liquido: Math.round(((preco ?? 0) * quantidade * (1 - desconto / 100) + Number.EPSILON) * 100) / 100,
    estimado: historico == null && catalogo != null,
    semPreco: preco == null,
  }
}

export function avisoPrecos(estimados: number, semPreco: number) {
  return [
    estimados > 0 ? 'Valores estimados pelo catálogo atual em itens sem preço histórico.' : '',
    semPreco > 0 ? 'Totais monetários incompletos: há itens sem preço conhecido; as quantidades estão incluídas.' : '',
  ].filter(Boolean).join(' ')
}
