export const CICLO_DIAS_DEFAULT = 7

export interface RotaCicloStatus {
  /** true se a rota foi finalizada dentro do ciclo atual (ou há execução ativa hoje) */
  feita: boolean
  /** dias desde a última execução finalizada. `null` se nunca executada. */
  diasDesdeUltima: number | null
  /** dias até o fim do período de "vencimento" (ciclo_dias - diasDesdeUltima). Negativo = atrasada. `null` se nunca executada. */
  diasParaVencer: number | null
  ultimaFinalizadaEm: string | null
  temExecucaoAtiva: boolean
  /** Quando há `lista_rodada_desde` no perfil: checklist por rodada (ignora alerta de atraso por janela de dias). */
  modoListaRodada: boolean
}

function diffDays(ms: number): number {
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function execucoesRelevantesParaRodada(
  execucoes: { iniciada_em: string; finalizada_em: string | null }[],
  listaRodadaDesde: string,
) {
  const desde = new Date(listaRodadaDesde).getTime()
  return execucoes.filter((e) => {
    if (!e.finalizada_em) return true
    return new Date(e.finalizada_em).getTime() >= desde
  })
}

export function calcularStatusCiclo(
  execucoes: { iniciada_em: string; finalizada_em: string | null }[],
  cicloDias: number,
  agora: Date = new Date(),
  listaRodadaDesde?: string | null,
): RotaCicloStatus {
  const modoListaRodada = Boolean(listaRodadaDesde)
  const pool = modoListaRodada && listaRodadaDesde
    ? execucoesRelevantesParaRodada(execucoes, listaRodadaDesde)
    : execucoes

  const finalizadas = pool
    .filter((e) => e.finalizada_em)
    .sort((a, b) => (b.finalizada_em ?? '').localeCompare(a.finalizada_em ?? ''))

  const ativa = pool.find((e) => !e.finalizada_em)
  const ultima = finalizadas[0]

  if (!ultima) {
    return {
      feita: Boolean(ativa),
      diasDesdeUltima: null,
      diasParaVencer: null,
      ultimaFinalizadaEm: null,
      temExecucaoAtiva: Boolean(ativa),
      modoListaRodada,
    }
  }

  const diasDesde = diffDays(agora.getTime() - new Date(ultima.finalizada_em!).getTime())
  const diasPara = cicloDias - diasDesde
  const feitaNoCiclo = modoListaRodada ? true : diasDesde < cicloDias

  return {
    feita: feitaNoCiclo || Boolean(ativa),
    diasDesdeUltima: diasDesde,
    diasParaVencer: diasPara,
    ultimaFinalizadaEm: ultima.finalizada_em,
    temExecucaoAtiva: Boolean(ativa),
    modoListaRodada,
  }
}

export function descreverStatus(s: RotaCicloStatus, cicloDias: number): string {
  if (s.temExecucaoAtiva) return 'Em andamento'
  if (s.modoListaRodada) {
    if (s.feita && !s.temExecucaoAtiva) return 'Feita nesta rodada'
    return 'Pendente nesta rodada'
  }
  if (s.diasDesdeUltima === null) return 'Nunca iniciada'
  if (s.diasDesdeUltima === 0) return 'Feita hoje'
  if (s.diasDesdeUltima === 1) return 'Feita ontem'
  if (s.feita) return `Feita há ${s.diasDesdeUltima} dias`
  const atraso = s.diasDesdeUltima - cicloDias
  if (atraso <= 0) return `Pendente — vence em breve`
  return `Atrasada ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`
}

/** Ordena rotas pendentes (mais atrasadas primeiro), depois feitas. */
export function ordenarPorPendencia<T extends { status: RotaCicloStatus }>(rotas: T[]): T[] {
  return rotas.slice().sort((a, b) => {
    if (a.status.feita !== b.status.feita) return a.status.feita ? 1 : -1
    const ad = a.status.diasDesdeUltima ?? Number.POSITIVE_INFINITY
    const bd = b.status.diasDesdeUltima ?? Number.POSITIVE_INFINITY
    return bd - ad
  })
}
