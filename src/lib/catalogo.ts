import { supabase } from './supabase'
import type { ProdutoCatalogo } from './pedidoPdf'

/** Inclui inativos para valorar históricos, sem truncar catálogos com mais de 1.000 produtos. */
export async function carregarCatalogo(): Promise<ProdutoCatalogo[]> {
  const produtos: ProdutoCatalogo[] = []
  for (let inicio = 0; ; inicio += 500) {
    const { data, error } = await supabase.from('produtos')
      .select('codigo, descricao, preco_tabela').order('id').range(inicio, inicio + 499)
    if (error) throw error
    produtos.push(...data)
    if (data.length < 500) return produtos
  }
}
