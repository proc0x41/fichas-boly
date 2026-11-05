import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { valorLinha } from '../src/lib/precos.ts'
import { intervaloPeriodo, intervaloValido, comparacao, csvProdutos } from '../src/lib/adminMetricas.ts'

const migration = await readFile(new URL('../supabase/migration-admin-metricas.sql', import.meta.url), 'utf8')
const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const admin = '00000000-0000-0000-0000-000000000001'
const vendedor = '00000000-0000-0000-0000-000000000002'
const rep = '00000000-0000-0000-0000-000000000003'
const cliente = '00000000-0000-0000-0000-000000000004'

async function banco() {
  const db = new PGlite({ extensions: { unaccent, pg_trgm } })
  try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${admin}'),('${vendedor}'),('${rep}');
  `)
  await db.exec(schema)
  await db.exec(`
    INSERT INTO perfis (user_id,nome,role) VALUES ('${admin}','Admin','admin'),('${vendedor}','Vendedor','vendedor'),('${rep}','Representada','representada');
    INSERT INTO clientes (id,vendedor_id,fantasia) VALUES ('${cliente}','${vendedor}','Loja');
    SELECT set_config('request.jwt.claim.sub','${admin}',false);
  `)
  return db
  } catch (error) { await db.close(); throw error }
}
async function metricas(db, inicio = '2026-03-01', fim = '2026-03-03', extra = '') {
  const { rows } = await db.query(`SELECT admin_metricas($1::date,$2::date${extra}) AS m`, [inicio, fim])
  return rows[0].m
}
async function pedido(db, id, data, tipo = 'pedido', desconto = 10, frete = 5) {
  await db.query(`INSERT INTO visitas (id,cliente_id,vendedor_id,data_visita,tipo_visita,desconto_percent,valor_frete)
    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, cliente, vendedor, data, tipo, desconto, frete])
}
async function itens(db, id, codigos) {
  await db.query('SELECT replace_visita_codigos($1,$2)', [id, JSON.stringify(codigos)])
}
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`

test('desconto específico zero, preços históricos, arredondamento e períodos locais', () => {
  assert.equal(valorLinha(2, 10, 99, 20, 0).liquido, 20)
  assert.equal(valorLinha(2, 10, 99, 20, null).liquido, 16)
  assert.equal(valorLinha(1, 0, 99, 0).preco, 0)
  assert.equal(valorLinha(3, null, 0.335, 0).liquido, 1.01)
  assert.equal(valorLinha(3, null, undefined, 0).semPreco, true)
  assert.equal(valorLinha(3, null, 4, 0).estimado, true)
  assert.deepEqual(intervaloPeriodo('mes', new Date(2026, 2, 1)), { inicio: '2026-03-01', fim: '2026-03-01' })
  assert.deepEqual(intervaloPeriodo('7dias', new Date(2026, 2, 1)), { inicio: '2026-02-23', fim: '2026-03-01' })
  assert.deepEqual(intervaloPeriodo('30dias', new Date(2026, 0, 5)), { inicio: '2025-12-07', fim: '2026-01-05' })
  assert.equal(intervaloValido('2026-02-30', '2026-03-01'), false)
  assert.equal(intervaloValido('2026-03-03', '2026-03-01'), false)
  assert.equal(intervaloValido('2024-02-29', '2024-03-01'), true)
  assert.equal(comparacao(1, 0), 'Sem base de comparação')
  assert.match(comparacao(15, 10), /\+50%/)
})

test('schema, migration idempotente, histórico imutável, agregação e autorização', async () => {
  const db = await banco()
  try {
    // Simula registros anteriores à migration, que devem continuar sem preço salvo.
    await db.exec('DROP TRIGGER trg_visita_codigo_preco ON visita_codigos')
    await db.exec(`INSERT INTO produtos (codigo,descricao,preco_tabela) VALUES ('A','Produto A',10),('B','Produto B',20),('Z','Grátis',0)`)
    await pedido(db, id(1), '2026-03-01')
    await itens(db, id(1), [{ codigo: 'A', quantidade: 2 }, { codigo: 'B', quantidade: 3, desconto_percent_override: 0 }, { codigo: 'DESCONHECIDO', quantidade: 4 }])
    await db.exec(migration)
    await db.exec(migration)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM visita_codigos WHERE preco_unitario IS NULL')).rows[0].n, 3)
    await pedido(db, id(2), '2026-03-03')
    await itens(db, id(2), [{ codigo: 'A', quantidade: 1 }, { codigo: 'Z', quantidade: 2 }])
    await pedido(db, id(3), '2026-02-28')
    await itens(db, id(3), [{ codigo: 'A', quantidade: 1 }])
    await pedido(db, id(4), '2026-03-02', 'orcamento')
    await itens(db, id(4), [{ codigo: 'A', quantidade: 5 }])
    await pedido(db, id(5), '2026-03-02', 'visita')
    await itens(db, id(5), [{ codigo: 'A', quantidade: 100 }])
    await db.query('UPDATE visitas SET compartilhado_em = now() WHERE id = $1', [id(2)])
    let m = await metricas(db)
    assert.deepEqual(m.resumo, { valor: 87, pedidos: 2, ticket: 43.5, unidades: 12, clientes: 1, frete: 10, estimados: 2, sem_preco: 1 })
    assert.equal(m.anterior.valor, 9)
    assert.equal(m.anterior.pedidos, 1)
    assert.equal(m.anterior_inicio, '2026-02-26')
    assert.equal(m.anterior_fim, '2026-02-28')
    assert.deepEqual(m.serie.map(p => [p.data, p.valor, p.pedidos]), [['2026-03-01', 78, 1], ['2026-03-02', 0, 0], ['2026-03-03', 9, 1]])
    assert.equal(m.pendencias.orcamentos, 1)
    assert.equal(m.pendencias.valor_orcamentos, 45)
    assert.equal(m.pendencias.nao_compartilhados, 1)
    assert.equal(m.pendencias.aguardando_nota, 1)
    assert.equal(m.produtos.find(p => p.codigo === 'A').pedidos, 2)
    assert.equal(m.produtos.reduce((s, p) => s + p.valor, 0), m.resumo.valor)
    assert.equal(m.produtos.find(p => p.codigo === 'B').valor, 60)

    await db.exec("UPDATE produtos SET preco_tabela = 100 WHERE codigo = 'A'")
    // Atualização retém inclusive NULL de históricos e zero de descontos.
    await itens(db, id(1), [{ codigo: ' a ', quantidade: 2 }, { codigo: 'B', quantidade: 3, desconto_percent_override: 0 }, { codigo: 'DESCONHECIDO', quantidade: 4 }])
    await itens(db, id(2), [{ codigo: 'A', quantidade: 2, preco_unitario: 999 }, { codigo: 'B', quantidade: 1 }, { codigo: 'Z', quantidade: 2 }])
    const historico = (await db.query('SELECT codigo,preco_unitario FROM visita_codigos WHERE visita_id = $1 ORDER BY codigo', [id(2)])).rows
    assert.equal(Number(historico[0].preco_unitario), 10)
    assert.equal(Number(historico[1].preco_unitario), 20)
    assert.equal(Number(historico[2].preco_unitario), 0)
    assert.equal((await db.query('SELECT preco_unitario FROM visita_codigos WHERE visita_id = $1 AND codigo = $2', [id(1), 'A'])).rows[0].preco_unitario, null)
    m = await metricas(db)
    assert.equal(m.resumo.valor, 276)
    assert.equal(m.resumo.estimados, 2)
    assert.equal(m.anterior.valor, 9)
    // Escrita direta também não pode adulterar o histórico.
    await db.query('UPDATE visita_codigos SET preco_unitario = 999 WHERE visita_id = $1', [id(2)])
    assert.equal((await metricas(db)).resumo.valor, 276)
    await assert.rejects(itens(db, id(2), [{ codigo: 'A', quantidade: -1 }]))
    assert.equal((await metricas(db)).resumo.valor, 276, 'Falha reverte remoções e alterações')
    await assert.rejects(itens(db, id(2), [{ codigo: 'A', quantidade: 1 }, { codigo: ' a ', quantidade: 1 }]))

    const vazio = await metricas(db, '2027-01-01', '2027-01-01')
    assert.equal(vazio.resumo.pedidos, 0)
    assert.equal(vazio.resumo.ticket, 0)
    assert.equal(vazio.anterior.pedidos, 0)
    assert.equal(vazio.serie.length, 1)
    assert.equal((await metricas(db, '2026-01-01', '2026-03-31')).agrupamento, 'dia')
    const mensal = await metricas(db, '2026-01-01', '2026-04-01')
    assert.equal(mensal.agrupamento, 'mes')
    assert.equal(mensal.serie.length, 4)
    assert.equal(mensal.serie[2].valor, 276)
    await assert.rejects(metricas(db, '2026-03-03', '2026-03-01'))
    await assert.rejects(metricas(db, '2026-03-01', '2026-03-03', ",p_ordem=>'invalido'"))

    await db.exec(`UPDATE produtos SET ativo = false WHERE codigo = 'A';
      INSERT INTO produtos(codigo,descricao,preco_tabela,ativo) VALUES ('OCULTO','Sem histórico',1,false);
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON produtos,visitas,visita_codigos TO authenticated;
      SET ROLE authenticated`)
    for (const usuario of [vendedor, rep, '']) {
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [usuario])
      await assert.rejects(metricas(db), /exclusivo ao administrador/)
    }
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [vendedor])
    assert.equal((await db.query("SELECT count(*)::int AS n FROM produtos WHERE codigo = 'A'")).rows[0].n, 1, 'Catálogo inativo usado em históricos continua visível')
    assert.equal((await db.query("SELECT count(*)::int AS n FROM produtos WHERE codigo = 'OCULTO'")).rows[0].n, 0)
    await itens(db, id(2), [{ codigo: 'A', quantidade: 2 }])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [rep])
    assert.equal((await db.query("SELECT count(*)::int AS n FROM produtos WHERE codigo = 'A'")).rows[0].n, 1)
    await assert.rejects(itens(db, id(2), []), /Não autorizado/)
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(metricas(db), /permission denied/)
  } finally { await db.close() }
})

test('mais de 1.000 pedidos e produtos: totais, páginas estáveis, busca, ordenação e CSV completo', async () => {
  const db = await banco()
  try {
    await db.exec(`
      INSERT INTO produtos(codigo,descricao,preco_tabela)
        SELECT 'P'||lpad(i::text,4,'0'),'Produto '||i,1 FROM generate_series(1,1205) i;
      INSERT INTO visitas(id,cliente_id,vendedor_id,data_visita,tipo_visita)
        SELECT ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'${cliente}','${vendedor}','2026-03-01','pedido' FROM generate_series(1,1205) i;
      INSERT INTO visita_codigos(visita_id,codigo,quantidade)
        SELECT ('10000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'P'||lpad(i::text,4,'0'),1 FROM generate_series(1,1205) i;
    `)
    const m = await metricas(db)
    assert.equal(m.resumo.pedidos, 1205)
    assert.equal(m.resumo.valor, 1205)
    assert.equal(m.total_produtos, 1205)
    assert.equal(m.produtos.length, 20)
    const todos = []
    for (let pagina = 1; pagina <= 7; pagina++) {
      todos.push(...(await metricas(db, undefined, undefined, `,p_pagina=>${pagina},p_tamanho=>200`)).produtos)
    }
    assert.equal(todos.length, 1205)
    assert.equal(new Set(todos.map(p => p.codigo)).size, 1205)
    const exportado = await metricas(db, undefined, undefined, ',p_exportar=>true')
    assert.deepEqual(exportado.produtos, todos)
    const busca = await metricas(db, undefined, undefined, ",p_busca=>'P1205'")
    assert.equal(busca.total_produtos, 1)
    assert.equal(busca.resumo.valor, 1205)
    assert.equal(busca.produtos[0].participacao, 0.08)
    assert.equal((await metricas(db, undefined, undefined, ",p_ordem=>'codigo',p_direcao=>'desc'")).produtos[0].codigo, 'P1205')
    assert.equal(csvProdutos(exportado.produtos, '2026-03-01', '2026-03-03').split('\r\n').length, 1206)
    const csv = csvProdutos([{...todos[0], codigo: '=1+1', descricao: 'Com "aspas"; e\nquebra'}], '2026-03-01', '2026-03-03')
    assert.ok(csv.startsWith('\uFEFF'))
    assert.ok(csv.includes("'="))
    assert.ok(csv.includes('""aspas""'))
  } finally { await db.close() }
})
