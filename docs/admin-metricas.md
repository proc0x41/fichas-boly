# Métricas administrativas

O painel `/admin` usa a RPC `admin_metricas`. A página e a função exigem administrador ativo. Não há ranking de vendedores.

As vendas consideram exclusivamente `visitas.tipo_visita = 'pedido'`, pela `data_visita`, com as duas datas do filtro incluídas. O mês atual termina hoje. A comparação usa o intervalo imediatamente anterior com a mesma quantidade de dias, inclusive na virada do mês. A série inclui períodos sem vendas: dias até 90 dias de intervalo e meses acima disso.

O valor de cada linha é arredondado para centavos depois de aplicar quantidade e desconto. O desconto específico, inclusive zero, prevalece sobre o global. O ticket médio divide o valor vendido pela quantidade de pedidos; clientes são distintos por `cliente_id`. Frete, orçamentos e visitas ficam fora do valor vendido. Os valores são de pedidos registrados, sem indicar recebimento financeiro.

O preço de tabela é capturado no servidor ao inserir um item. Edições mantêm o preço dos códigos preservados, mesmo com alteração de quantidade ou desconto. Remover e salvar a remoção, depois adicionar o código novamente, captura o preço atual. Copiar os itens de outro pedido também usa preços atuais. Registros antigos continuam com `preco_unitario = NULL`: o catálogo atual fornece uma estimativa identificada nas telas e no PDF. Itens sem preço conhecido entram nas quantidades e tornam os valores monetários incompletos. Produtos inativos usados nos pedidos acessíveis continuam disponíveis para calcular os históricos.

A busca e a ordenação afetam somente os produtos. A participação usa o valor de todos os produtos vendidos no intervalo como denominador. A RPC agrega no banco e retorna um objeto JSON, sem truncamento pelo limite de linhas do PostgREST. A opção `p_exportar = true` devolve todos os produtos correspondentes à busca, na mesma ordem da tabela. O CSV inclui datas, indicadores de estimativa e valores ausentes, usa UTF-8 com BOM e protege células contra fórmulas.

## Aplicação em instalações existentes

1. Autenticar a CLI Supabase e conferir o projeto vinculado.
2. Aplicar **antes de publicar o frontend**:

   ```sh
   npx supabase db query --linked --file supabase/migration-admin-metricas.sql
   ```

   Como alternativa, executar o arquivo inteiro no SQL Editor do projeto correto. A migration é transacional e idempotente; não faz backfill de preços antigos. Não executar migrations antigas de `replace_visita_codigos` depois desta, pois substituiriam a função atual.

3. Conferir com uma conta administrativa os totais de um intervalo conhecido e então publicar o frontend. Instalações novas usam `supabase/schema.sql`, já consolidado.

## Verificação local

```sh
npm test
npm run test:ui
npm run build
npm run lint
```

Os testes SQL usam PostgreSQL embarcado (PGlite) e o schema real. Cobrem migration reaplicada, preços históricos, descontos zero e globais, quantidades sem preço, frete, orçamentos, datas inclusivas, dias vazios, agrupamento mensal, permissões e exportação de 1.205 produtos/pedidos sem perdas ou duplicações.

Os testes de interface usam Edge local e um servidor Vite na porta 5174, com Supabase inteiramente simulado, sem acessar dados reais. Cobrem celular, desktop, teclado nos gráficos, CSV, paginação, filtros inválidos, falhas com nova tentativa, respostas fora de ordem, ausência de vendas, bloqueio por perfil e estabilidade monetária dos PDFs.
