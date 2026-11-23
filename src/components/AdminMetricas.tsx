import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { avisoPrecos } from '../lib/precos'
import { comparacao, csvProdutos, dataBr, intervaloPeriodo, intervaloValido, moeda, numero,
  type Metricas, type OrdemProduto, type Periodo } from '../lib/adminMetricas'
import { MetricasGrafico } from './MetricasGrafico'
import { MetricasCategorias } from './MetricasCategorias'
import { PaginationBar } from './PaginationBar'

const periodos: [Periodo, string][] = [['hoje', 'Hoje'], ['7dias', 'Últimos 7 dias'], ['30dias', 'Últimos 30 dias'], ['mes', 'Mês atual'], ['personalizado', 'Personalizado']]
const colunas: [OrdemProduto, string][] = [['codigo', 'Código'], ['descricao', 'Descrição'], ['quantidade', 'Quantidade'], ['pedidos', 'Pedidos'], ['valor', 'Valor após descontos'], ['participacao', 'Participação']]
const controle = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 disabled:cursor-not-allowed disabled:opacity-50'

export function AdminMetricas() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [datas, setDatas] = useState(() => intervaloPeriodo('mes'))
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<OrdemProduto>('quantidade')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('desc')
  const [pagina, setPagina] = useState(1)
  const [tentativa, setTentativa] = useState(0)
  const [resposta, setResposta] = useState<{ chave: string; dados?: Metricas; erro?: string }>()
  const [exportacao, setExportacao] = useState<{ chave: string; erro?: string; carregando?: boolean }>()
  const exportAbort = useRef<AbortController | null>(null)
  const valido = intervaloValido(datas.inicio, datas.fim)
  const chave = JSON.stringify([datas, busca, ordem, direcao, pagina, tentativa])
  const dados = resposta?.chave === chave ? resposta.dados : undefined
  const erro = resposta?.chave === chave ? resposta.erro : undefined
  const carregando = valido && !dados && !erro

  useEffect(() => {
    const controller = new AbortController()
    if (valido) {
      const timer = setTimeout(() => {
        void (async () => {
          try {
            const { data, error } = await supabase.rpc('admin_metricas', {
              p_inicio: datas.inicio, p_fim: datas.fim, p_busca: busca.trim(),
              p_ordem: ordem, p_direcao: direcao, p_pagina: pagina, p_tamanho: 20,
            }).abortSignal(controller.signal)
            if (error) throw error
            if (!data) throw new Error('Resposta vazia')
            if (!controller.signal.aborted) setResposta({ chave, dados: data as Metricas })
          } catch {
            if (!controller.signal.aborted) setResposta({ chave, erro: 'Não foi possível carregar as métricas. Tente novamente.' })
          }
        })()
      }, 250)
      return () => { clearTimeout(timer); controller.abort(); exportAbort.current?.abort() }
    }
    return () => { controller.abort(); exportAbort.current?.abort() }
  }, [chave, valido, datas.inicio, datas.fim, busca, ordem, direcao, pagina])

  async function exportar() {
    const controller = new AbortController()
    exportAbort.current?.abort()
    exportAbort.current = controller
    setExportacao({ chave, carregando: true })
    try {
      const { data, error } = await supabase.rpc('admin_metricas', {
        p_inicio: datas.inicio, p_fim: datas.fim, p_busca: busca.trim(),
        p_ordem: ordem, p_direcao: direcao, p_exportar: true,
      }).abortSignal(controller.signal)
      if (error || !data) throw error ?? new Error('Resposta vazia')
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(new Blob([csvProdutos((data as Metricas).produtos, datas.inicio, datas.fim)], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `produtos-vendidos_${datas.inicio}_${datas.fim}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportacao({ chave })
    } catch {
      if (!controller.signal.aborted) setExportacao({ chave, erro: 'Não foi possível exportar. Tente novamente.' })
    } finally {
      if (exportAbort.current === controller) {
        setExportacao(atual => atual?.chave === chave ? { ...atual, carregando: false } : atual)
        exportAbort.current = null
      }
    }
  }

  const aviso = dados ? avisoPrecos(dados.resumo.estimados + dados.anterior.estimados + dados.pendencias.estimados,
    dados.resumo.sem_preco + dados.anterior.sem_preco + dados.pendencias.sem_preco) : ''

  return <section className="admin-metricas space-y-5" aria-label="Métricas de pedidos">
    <p className="max-w-3xl text-sm text-gray-600">Pedidos registrados pela data da visita, após descontos. Os valores não indicam recebimento financeiro. Frete separado; orçamentos e visitas fora das vendas.</p>
    <div className="flex flex-wrap gap-2" aria-label="Período">
      {periodos.map(([valor, label]) => <button type="button" key={valor} aria-pressed={periodo === valor}
        onClick={() => { setPeriodo(valor); if (valor !== 'personalizado') setDatas(intervaloPeriodo(valor)); setPagina(1) }}
        className={`${controle} ${periodo === valor ? 'border-primary-600 bg-primary-600! text-white!' : 'hover:bg-gray-50'}`}>{label}</button>)}
    </div>
    {periodo === 'personalizado' && <div className="flex flex-wrap gap-3">
      {(['inicio', 'fim'] as const).map(campo => <label key={campo} className="flex min-w-0 flex-col gap-1 text-sm text-gray-700">
        {campo === 'inicio' ? 'Data inicial' : 'Data final'}
        <input type="date" min="1900-01-01" max="9999-12-31" className={controle} value={datas[campo]}
          aria-invalid={!valido} aria-describedby={!valido ? 'intervalo-erro' : undefined}
          onChange={e => { setDatas({ ...datas, [campo]: e.target.value }); setPagina(1) }} />
      </label>)}
    </div>}
    {!valido && <p id="intervalo-erro" role="alert" className="text-sm text-red-700">Informe datas válidas, com a data final igual ou posterior à inicial.</p>}
    {carregando && <p role="status" className="flex items-center gap-2 py-8 text-sm text-gray-600"><Loader2 className="h-5 w-5 animate-spin" /> Carregando métricas…</p>}
    {erro && <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{erro}</p><button type="button" className={controle} onClick={() => setTentativa(t => t + 1)}><RotateCcw className="mr-2 inline h-4 w-4" />Tentar novamente</button>
    </div>}
    {dados && <>
      <p className="text-sm text-gray-600">{dataBr(dados.inicio)} a {dataBr(dados.fim)} · Comparação: {dataBr(dados.anterior_inicio)} a {dataBr(dados.anterior_fim)}</p>
      {aviso && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{aviso} O aviso também considera a comparação e os orçamentos.</p>}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-5 border-y border-gray-200 bg-white px-4 py-5 lg:grid-cols-5">
        {([['valor', 'Valor vendido', moeda], ['pedidos', 'Pedidos', numero], ['ticket', 'Ticket médio', moeda], ['unidades', 'Unidades vendidas', numero], ['clientes', 'Clientes que compraram', numero]] as const).map(([campo, label, formato]) => <div key={campo}>
          <dt className="text-sm text-gray-600">{label}</dt>
          <dd className="mt-1 break-words text-xl font-bold tabular-nums text-gray-900">{formato(dados.resumo[campo])}</dd>
          <dd className="mt-1 text-xs text-gray-600">{comparacao(dados.resumo[campo], dados.anterior[campo])}</dd>
        </div>)}
      </dl>
      <p className="text-sm text-gray-600">Frete dos pedidos: <strong className="tabular-nums text-gray-900">{moeda(dados.resumo.frete)}</strong> · Período anterior: {moeda(dados.anterior.frete)}</p>
      {dados.categorias ? <MetricasCategorias categorias={dados.categorias} />
        : <p role="status" className="text-sm text-gray-600">A separação das vendas entre Boly e importados ainda não está disponível.</p>}
      <section className="rounded-xl border border-gray-200 bg-white p-4" aria-labelledby="evolucao-titulo">
        <h3 id="evolucao-titulo" className="mb-4 font-bold text-gray-900">Evolução das vendas <span className="text-sm font-normal text-gray-600">· por {dados.agrupamento === 'dia' ? 'dia' : 'mês'}</span></h3>
        {dados.resumo.pedidos === 0 && <p className="mb-4 text-sm text-gray-600">Nenhuma venda registrada neste período.</p>}
        <div className="grid gap-6 md:grid-cols-2">
          <MetricasGrafico key={`valor-${datas.inicio}-${datas.fim}`} serie={dados.serie} campo="valor" mensal={dados.agrupamento === 'mes'} />
          <MetricasGrafico key={`pedidos-${datas.inicio}-${datas.fim}`} serie={dados.serie} campo="pedidos" mensal={dados.agrupamento === 'mes'} />
        </div>
        <details className="mt-3 text-sm text-gray-700"><summary className="cursor-pointer py-2">Consultar dados dos gráficos em tabela</summary>
          <div className="max-h-72 overflow-auto"><table className="w-full text-left tabular-nums"><caption className="sr-only">Evolução do valor vendido e pedidos</caption>
            <thead><tr><th scope="col" className="p-2">Período</th><th scope="col" className="p-2">Valor vendido</th><th scope="col" className="p-2">Pedidos</th></tr></thead>
            <tbody>{dados.serie.map(p => <tr key={p.data}><th scope="row" className="p-2 font-normal">{dataBr(p.data)}</th><td className="p-2">{moeda(p.valor)}</td><td className="p-2">{numero(p.pedidos)}</td></tr>)}</tbody>
          </table></div>
        </details>
      </section>
      <section aria-labelledby="pendencias-titulo">
        <h3 id="pendencias-titulo" className="mb-3 font-bold text-gray-900">Orçamentos e pendências do período</h3>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-600">Orçamentos</dt><dd className="mt-1 font-semibold tabular-nums">{numero(dados.pendencias.orcamentos)} · {moeda(dados.pendencias.valor_orcamentos)}</dd><dd className="mt-1 text-xs text-gray-600">Frete separado: {moeda(dados.pendencias.frete_orcamentos)}</dd></div>
          <div><dt className="text-gray-600">Pedidos não compartilhados</dt><dd className="mt-1 font-semibold tabular-nums">{numero(dados.pendencias.nao_compartilhados)}</dd></div>
          <div><dt className="text-gray-600">Compartilhados aguardando NF</dt><dd className="mt-1 font-semibold tabular-nums">{numero(dados.pendencias.aguardando_nota)}</dd></div>
        </dl>
      </section>
    </>}
    <section className="space-y-3 border-t border-gray-200 pt-5" aria-labelledby="produtos-titulo" aria-busy={carregando}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="produtos-titulo" className="font-bold text-gray-900">Produtos mais vendidos</h3>
        <button type="button" onClick={() => void exportar()} className={controle} disabled={!dados || exportacao?.chave === chave && exportacao.carregando}>
          <Download className="mr-2 inline h-4 w-4" />{exportacao?.chave === chave && exportacao.carregando ? 'Exportando…' : 'Exportar CSV'}
        </button>
      </div>
      <label className="block max-w-md text-sm text-gray-700">Buscar por código ou descrição
        <input type="search" value={busca} onChange={e => { setBusca(e.target.value); setPagina(1) }} className={`${controle} mt-1 w-full`} placeholder="Código ou descrição" />
      </label>
      {exportacao?.chave === chave && exportacao.erro && <p role="alert" className="text-sm text-red-700">{exportacao.erro}</p>}
      {dados && <>
        <p className="text-xs text-gray-600">Participação sobre o valor vendido de todos os produtos do período. Valores após descontos, sem frete.</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" tabIndex={0} role="region" aria-label="Tabela de produtos vendidos">
          <table className="w-full text-left text-sm"><caption className="sr-only">Produtos vendidos de {dataBr(datas.inicio)} a {dataBr(datas.fim)}</caption>
            <thead className="bg-gray-50 text-gray-700"><tr>{colunas.map(([campo, label]) => <th key={campo} scope="col" className="whitespace-nowrap p-3" aria-sort={ordem === campo ? direcao === 'desc' ? 'descending' : 'ascending' : 'none'}>
              <button type="button" className="rounded py-1 text-left" onClick={() => { setOrdem(campo); setDirecao(ordem === campo && direcao === 'desc' ? 'asc' : 'desc'); setPagina(1) }}>{label}{ordem === campo ? direcao === 'desc' ? ' ↓' : ' ↑' : ''}</button>
            </th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{dados.produtos.map(p => <tr key={p.codigo}>
              <th scope="row" className="p-3 font-medium">{p.codigo}</th><td className="min-w-48 p-3">{p.descricao}
                {(p.estimados > 0 || p.sem_preco > 0) && <span className="mt-1 block text-xs text-amber-800">{p.sem_preco > 0 ? 'Valor incompleto' : 'Valor estimado'}</span>}
              </td><td className="p-3 tabular-nums">{numero(p.quantidade)}</td><td className="p-3 tabular-nums">{numero(p.pedidos)}</td><td className="whitespace-nowrap p-3 tabular-nums">{moeda(p.valor)}</td><td className="p-3 tabular-nums">{numero(p.participacao)}%</td>
            </tr>)}</tbody>
          </table>
          {dados.produtos.length === 0 && <p className="p-6 text-center text-sm text-gray-600">{busca ? 'Nenhum produto encontrado para esta busca.' : 'Nenhum produto vendido neste período.'}</p>}
        </div>
        <PaginationBar page={pagina} pageSize={20} total={dados.total_produtos} onPageChange={setPagina} />
      </>}
    </section>
  </section>
}
