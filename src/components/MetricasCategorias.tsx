import { moeda, numero, type CategoriasMetricas } from '../lib/adminMetricas'
import { avisoPrecos } from '../lib/precos'

const grupos = [
  { chave: 'boly', titulo: 'Produtos Boly', regra: 'Demais códigos', cor: 'bg-primary-700' },
  { chave: 'importados', titulo: 'Produtos importados', regra: 'Códigos que começam com duas letras', cor: 'bg-emerald-700' },
] as const

export function MetricasCategorias({ categorias }: { categorias: CategoriasMetricas }) {
  const total = categorias.boly.valor + categorias.importados.valor

  return <section className="space-y-4" aria-labelledby="categorias-titulo">
    <div>
      <h3 id="categorias-titulo" className="font-bold text-gray-900">Vendas de Boly e importados</h3>
      <p className="mt-1 text-sm text-gray-600">Totais do período selecionado, após descontos e sem frete.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {grupos.map(({ chave, titulo, regra, cor }) => {
        const grupo = categorias[chave]
        const aviso = avisoPrecos(grupo.estimados, grupo.sem_preco)
        return <section key={chave} aria-label={titulo} className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
          <h4 className="flex items-center gap-2 font-semibold text-gray-900"><span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-sm ${cor}`} />{titulo}</h4>
          <p className="mt-1 text-xs text-gray-600">{regra}</p>
          <dl className="mt-4">
            <dt className="text-sm text-gray-600">Valor vendido</dt>
            <dd className="mt-1 break-words text-2xl font-bold tabular-nums text-gray-900">{moeda(grupo.valor)}</dd>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <div><dt className="text-gray-600">Unidades vendidas</dt><dd className="font-semibold tabular-nums text-gray-900">{numero(grupo.unidades)}</dd></div>
              <div><dt className="text-gray-600">Pedidos com estes produtos</dt><dd className="font-semibold tabular-nums text-gray-900">{numero(grupo.pedidos)}</dd></div>
            </div>
          </dl>
          {aviso && <p className="mt-3 text-xs text-amber-900">{aviso}</p>}
        </section>
      })}
    </div>
    <figure className="rounded-xl border border-gray-200 bg-white p-4" aria-labelledby="categorias-grafico-titulo">
      <figcaption id="categorias-grafico-titulo" className="font-semibold text-gray-900">Participação no valor vendido</figcaption>
      {total === 0 ? <p className="mt-3 text-sm text-gray-600">Sem valor vendido para comparar neste período.</p> : <div className="mt-4 space-y-4">
        {grupos.map(({ chave, titulo, cor }) => <div key={chave}>
          <div className="mb-1 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm text-gray-700">
            <span>{titulo}</span><span className="font-semibold tabular-nums">{numero(categorias[chave].participacao)}%</span>
          </div>
          <div aria-hidden="true" className="h-5 overflow-hidden rounded bg-gray-100">
            <div className={`h-full ${cor}`} style={{ width: `${Math.min(100, Math.max(0, categorias[chave].valor / total * 100))}%` }} />
          </div>
        </div>)}
      </div>}
      <p className="mt-3 text-xs text-gray-600">Um pedido com produtos dos dois grupos aparece na contagem de ambos.</p>
    </figure>
  </section>
}
