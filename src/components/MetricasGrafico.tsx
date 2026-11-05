import { useState } from 'react'
import { dataBr, moeda, numero, type PontoMetrica } from '../lib/adminMetricas'

export function MetricasGrafico({ serie, campo, mensal }: {
  serie: PontoMetrica[]; campo: 'valor' | 'pedidos'; mensal: boolean
}) {
  const [selecionado, setSelecionado] = useState(0)
  const formatar = campo === 'valor' ? moeda : numero
  const titulo = campo === 'valor' ? 'Valor vendido' : 'Quantidade de pedidos'
  const max = Math.max(campo === 'pedidos' ? 2 : 1, ...serie.map(p => p[campo]))
  const ponto = serie[Math.min(selecionado, serie.length - 1)]
  const label = (d: string) => mensal ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : dataBr(d)
  const x = (i: number) => serie.length === 1 ? 320 : 65 + i / (serie.length - 1) * 525
  const y = (n: number) => 155 - n / max * 115
  const cor = campo === 'valor' ? '#1d4ed8' : '#047857'
  return <figure className="min-w-0">
    <figcaption className="font-semibold text-gray-900">{titulo}</figcaption>
    <p className="mt-1 min-h-10 text-sm tabular-nums text-gray-600" aria-live="polite">
      {ponto ? `${label(ponto.data)}: ${formatar(ponto[campo])}` : 'Sem dados no período'}
    </p>
    <svg viewBox="0 0 620 195" className="w-full overflow-visible" role="group" aria-label={`${titulo}, por ${mensal ? 'mês' : 'dia'}. Use Tab ou as setas para consultar os valores.`}>
      {[0, 0.5, 1].map(fracao => <g key={fracao}>
        <line x1="65" x2="590" y1={y(max * fracao)} y2={y(max * fracao)} stroke="#e5e7eb" />
        <text x="57" y={y(max * fracao) + 4} textAnchor="end" fill="#4b5563" fontSize="11">
          {Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(max * fracao)}
        </text>
      </g>)}
      <polyline fill="none" stroke={cor} strokeWidth="2" points={serie.map((p, i) => `${x(i)},${y(p[campo])}`).join(' ')} />
      {serie.map((p, i) => <circle key={p.data} cx={x(i)} cy={y(p[campo])} r={selecionado === i ? 5 : 3}
        fill={cor} stroke="white" strokeWidth="1.5" tabIndex={0} role="img"
        aria-label={`${label(p.data)}: ${formatar(p[campo])}`}
        onFocus={() => setSelecionado(i)} onMouseEnter={() => setSelecionado(i)}
        onKeyDown={e => {
          const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (!passo) return
          e.preventDefault()
          const proximo = (i + passo + serie.length) % serie.length
          e.currentTarget.parentElement?.querySelectorAll<SVGCircleElement>('circle')[proximo]?.focus()
        }}>
        <title>{label(p.data)}: {formatar(p[campo])}</title>
      </circle>)}
      {serie.length > 0 && <>
        <text x="65" y="182" fill="#4b5563" fontSize="11">{label(serie[0].data)}</text>
        {serie.length > 1 && <text x="590" y="182" textAnchor="end" fill="#4b5563" fontSize="11">{label(serie[serie.length - 1].data)}</text>}
      </>}
    </svg>
  </figure>
}
