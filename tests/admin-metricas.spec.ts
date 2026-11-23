import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const origem = 'https://metrics-tests.supabase.co'
const usuario = '00000000-0000-0000-0000-000000000001'
const perfil = { id: usuario, user_id: usuario, nome: 'Admin teste', role: 'admin', ativo: true, must_change_password: false }
const dia = (d: Date) => d.toISOString().slice(0, 10)
const mover = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return dia(x) }

function resultado(inicio: string, fim: string, busca = '', pagina = 1, exportar = false) {
  const dias = (Date.parse(fim) - Date.parse(inicio)) / 86400000 + 1
  const valor = dias === 1 ? 77 : dias === 7 ? 700 : 1234.5
  const produtos = Array.from({ length: 25 }, (_, i) => ({ codigo: `P${String(i + 1).padStart(3, '0')}`, descricao: `Produto ${i + 1}`, quantidade: 50 - i, pedidos: 2, valor: 10, participacao: 1, estimados: 0, sem_preco: 0 }))
  const filtrados = produtos.filter(p => (p.codigo + p.descricao).toLowerCase().includes(busca.toLowerCase()))
  const serie = []
  for (let data = dias <= 90 ? inicio : inicio.slice(0, 7) + '-01'; data <= fim;) {
    serie.push({ data, valor: data === inicio ? valor : 0, pedidos: data === inicio ? 2 : 0 })
    const d = new Date(data + 'T12:00:00Z')
    if (dias <= 90) d.setUTCDate(d.getUTCDate() + 1)
    else d.setUTCMonth(d.getUTCMonth() + 1)
    data = dia(d)
  }
  return { inicio, fim, anterior_inicio: mover(inicio, -dias), anterior_fim: mover(inicio, -1), agrupamento: dias <= 90 ? 'dia' : 'mes',
    resumo: { valor, pedidos: 2, ticket: valor / 2, unidades: 20, clientes: 2, frete: 30, estimados: 0, sem_preco: 0 },
    anterior: { valor: 0, pedidos: 0, ticket: 0, unidades: 0, clientes: 0, frete: 0, estimados: 0, sem_preco: 0 },
    categorias: {
      boly: { valor: valor * 0.6, unidades: 12, pedidos: 2, participacao: 60, estimados: 0, sem_preco: 0 },
      importados: { valor: valor * 0.4, unidades: 8, pedidos: 1, participacao: 40, estimados: 0, sem_preco: 0 },
    },
    pendencias: { orcamentos: 3, valor_orcamentos: 500, frete_orcamentos: 20, estimados: 0, sem_preco: 0, nao_compartilhados: 1, aguardando_nota: 1 },
    serie, total_produtos: filtrados.length, produtos: exportar ? filtrados : filtrados.slice((pagina - 1) * 20, pagina * 20) }
}

async function preparar(page: Page, role = 'admin', opcoes: { falha?: boolean; lento?: boolean; vazio?: boolean } = {}) {
  await page.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
  let falhar = opcoes.falha
  await page.addInitScript(({ origem, usuario }) => {
    const ref = new URL(origem).hostname.split('.')[0]
    const user = { id: usuario, aud: 'authenticated', role: 'authenticated', email: 'teste@example.com' }
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'fake-token', refresh_token: 'fake-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }))
  }, { origem, usuario })
  await page.route(`${origem}/**`, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json', 'content-range': '0-0/5' }
    if (request.method() === 'OPTIONS') return route.fulfill({ headers, status: 200 })
    if (url.pathname.endsWith('/rpc/admin_metricas')) {
      if (falhar) { falhar = false; return route.fulfill({ status: 500, headers, body: JSON.stringify({ message: 'Falha simulada' }) }) }
      const b = request.postDataJSON()
      const dias = (Date.parse(b.p_fim) - Date.parse(b.p_inicio)) / 86400000 + 1
      if (opcoes.lento && dias === 7) await new Promise(resolve => setTimeout(resolve, 900))
      const dados = resultado(b.p_inicio, b.p_fim, b.p_busca, b.p_pagina, b.p_exportar)
      if (opcoes.vazio) {
        dados.produtos = []; dados.total_produtos = 0
        for (const chave of Object.keys(dados.resumo) as (keyof typeof dados.resumo)[]) dados.resumo[chave] = 0
        for (const grupo of Object.values(dados.categorias)) {
          for (const chave of Object.keys(grupo) as (keyof typeof grupo)[]) grupo[chave] = 0
        }
        for (const ponto of dados.serie) { ponto.valor = 0; ponto.pedidos = 0 }
      }
      return route.fulfill({ headers, body: JSON.stringify(dados) }).catch(() => {})
    }
    const body = url.pathname.endsWith('/perfis') ? request.method() === 'HEAD' ? '' : JSON.stringify({ ...perfil, role })
      : url.pathname.endsWith('/user') ? JSON.stringify({ id: usuario }) : '[]'
    return route.fulfill({ headers, body })
  })
}

test('painel desktop: filtros, gráfico por teclado, busca, paginação e CSV', async ({ page }) => {
  await preparar(page)
  await page.setViewportSize({ width: 1440, height: 1080 })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Produtos mais vendidos' })).toBeVisible()
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*1\.234,50$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Vendedores/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Produtos Boly', exact: true })).toContainText('740,70')
  await expect(page.getByRole('region', { name: 'Produtos importados', exact: true })).toContainText('493,80')
  await expect(page.getByRole('figure', { name: 'Participação no valor vendido' })).toContainText('60%')
  await expect(page.getByRole('figure', { name: 'Participação no valor vendido' })).toContainText('40%')
  await page.screenshot({ path: 'test-results/admin-desktop.png' })
  const pontos = page.locator('svg[role="group"] circle')
  await pontos.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(pontos.nth(1)).toBeFocused()
  await page.getByText('Consultar dados dos gráficos em tabela').click()
  await expect(page.getByRole('table', { name: 'Evolução do valor vendido e pedidos' })).toBeVisible()
  await page.getByRole('button', { name: 'Próxima', exact: true }).click()
  await expect(page.getByText('Página 2 de 2')).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'P025', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Produtos importados', exact: true })).toContainText('493,80')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar CSV' }).click()
  const arquivo = await download
  const csv = readFileSync((await arquivo.path())!, 'utf8')
  expect(csv.split('\r\n')).toHaveLength(26)
  expect(arquivo.suggestedFilename()).toMatch(/produtos-vendidos_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv/)
  await page.getByRole('searchbox').fill('P025')
  await expect(page.getByText('Página 1 de 1')).toBeVisible()
  await expect(page.getByRole('rowheader', { name: 'P025', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hoje', exact: true }).click()
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*77,00$/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Produtos Boly', exact: true })).toContainText('46,20')
  await expect(page.getByRole('region', { name: 'Produtos importados', exact: true })).toContainText('30,80')
})

test('celular: sem overflow de página, datas inválidas e gráfico mensal', async ({ page }) => {
  await preparar(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin')
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*1\.234,50$/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('region', { name: 'Produtos importados', exact: true })).toContainText('493,80')
  await page.screenshot({ path: 'test-results/admin-mobile.png' })
  await page.getByRole('region', { name: 'Produtos Boly', exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: 'test-results/admin-mobile-categorias.png' })
  await page.getByRole('figure', { name: 'Participação no valor vendido' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/admin-mobile-categorias-grafico.png' })
  await page.getByRole('heading', { name: /Evolução das vendas/ }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/admin-mobile-graficos.png' })
  await page.getByRole('heading', { name: 'Produtos mais vendidos' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/admin-mobile-produtos.png' })
  await page.getByRole('button', { name: 'Personalizado', exact: true }).click()
  await page.getByLabel('Data inicial').fill('2026-04-02')
  await page.getByLabel('Data final').fill('2026-04-01')
  await expect(page.getByRole('alert')).toContainText('Informe datas válidas')
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*1\.234,50$/ })).toHaveCount(0)
  await page.getByLabel('Data inicial').fill('2026-01-01')
  await expect(page.getByRole('heading', { name: 'Evolução das vendas · por mês' })).toBeVisible()
  await expect(page.locator('svg[role="group"] circle')).toHaveCount(8)
})

test('falha permite nova tentativa; mudança rápida descarta resposta anterior', async ({ page }) => {
  await preparar(page, 'admin', { falha: true, lento: true })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar')
  await page.getByRole('button', { name: 'Tentar novamente' }).click()
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*1\.234,50$/ })).toBeVisible()
  const respostaLenta = page.waitForRequest(r => r.url().includes('/rpc/admin_metricas') && r.postDataJSON().p_inicio !== r.postDataJSON().p_fim)
  await page.getByRole('button', { name: 'Últimos 7 dias' }).click()
  await respostaLenta
  await page.getByRole('button', { name: 'Hoje', exact: true }).click()
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*77,00$/ })).toBeVisible()
  await page.waitForTimeout(1100)
  await expect(page.locator('dd').filter({ hasText: /^R\$\s*77,00$/ })).toBeVisible()
  await expect(page.getByText('R$ 700,00', { exact: true })).toHaveCount(0)
})

for (const role of ['vendedor', 'representada']) test(`página bloqueada para ${role}`, async ({ page }) => {
  await preparar(page, role)
  let chamadasMetricas = 0
  page.on('request', r => { if (r.url().includes('/rpc/admin_metricas')) chamadasMetricas++ })
  await page.goto('/admin')
  await expect(page).not.toHaveURL(/\/admin$/)
  expect(chamadasMetricas).toBe(0)
})

test('período sem vendas mantém gráficos e mostra ausência de produtos', async ({ page }) => {
  await preparar(page, 'admin', { vazio: true })
  await page.goto('/admin')
  await expect(page.getByText('Nenhuma venda registrada neste período.')).toBeVisible()
  await expect(page.getByText('Nenhum produto vendido neste período.')).toBeVisible()
  await expect(page.getByText('Sem valor vendido para comparar neste período.')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Produtos Boly', exact: true })).toContainText('R$ 0,00')
  await expect(page.getByText('Sem base de comparação', { exact: true })).toHaveCount(5)
  await expect(page.locator('svg[role="group"] circle')).toHaveCount(10)
})

test('PDF mantém valores históricos após alterar catálogo e sinaliza estimativas e preços ausentes', async ({ page }) => {
  await preparar(page)
  await page.goto('/admin')
  const resultado = await page.evaluate(async () => {
    const modulo = '/src/lib/pedidoPdf.ts'
    const { buildPedidoPdfBlob } = await import(modulo)
    const base = {
      numeroPedido: 123, dataEmissao: new Date('2026-03-01T12:00:00Z'), tipoVisita: 'pedido',
      cliente: { fantasia: 'Loja teste', contatos: [] },
      visita: { condicoes_pagamento: '30 dias', observacao: null, valor_frete: 5, desconto_percent: 50 },
      vendedor: { nome: 'Vendedor teste', telefone: null },
    }
    const gerar = async (historico: number | null, catalogo?: number) => {
      const pdf = await buildPedidoPdfBlob({ ...base,
        codigos: [{ id: '1', visita_id: '1', codigo: 'A', quantidade: 2, preco_unitario: historico, desconto_percent_override: 0 }],
        produtosPorCodigo: new Map(catalogo == null ? [] : [['a', { codigo: 'A', descricao: 'Produto', preco_tabela: catalogo }]]),
      }).text()
      return { valores: (pdf.match(/R\$[^)]*/g) ?? []).map((v: string) => v.replace(/[^\d,.]/g, '')),
        estimado: pdf.includes('Valores estimados'), incompleto: pdf.includes('incompletos') }
    }
    return { antes: await gerar(10, 10), depois: await gerar(10, 100), estimado: await gerar(null, 10), semPreco: await gerar(null) }
  })
  expect(resultado.antes.valores.length).toBeGreaterThan(5)
  expect(resultado.antes.valores).toEqual(resultado.depois.valores)
  expect(resultado.antes.valores).toContain('25,00')
  expect(resultado.antes.estimado).toBe(false)
  expect(resultado.estimado.estimado).toBe(true)
  expect(resultado.semPreco.incompleto).toBe(true)
})
