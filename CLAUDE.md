# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

PWA mobile-first em português (pt-BR) que substitui fichas físicas de visita comercial da Boly por um fluxo digital: cadastro de clientes, registro de visitas com códigos de produto, montagem e execução de rotas. Domínio é em português — preserve a nomenclatura (`vendedor`, `cliente`, `visita`, `rota`, `pedido`, `representada`, `ciclo`, `rodada`, `fantasia`, `comprador`).

## Stack

React 19 + Vite 7 + TypeScript + TailwindCSS v4 + Supabase (PostgreSQL + Auth + Edge Functions) + vite-plugin-pwa (Workbox). Deploy na Vercel.

## Commands

```bash
npm run dev      # Vite dev server em http://localhost:5173
npm run build    # tsc -b && vite build (typecheck obrigatório)
npm run lint     # ESLint flat config
npm run preview  # Preview do build
```

Não há suíte de testes configurada. `npm run build` é a verificação canônica antes de declarar uma tarefa pronta — ele roda `tsc -b` em modo composite (ver [tsconfig.app.json](tsconfig.app.json)) e quebra em qualquer erro de tipo.

## Variáveis de ambiente

Apenas duas, definidas em `.env.local` (dev) e Vercel (prod):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

[src/lib/supabase.ts](src/lib/supabase.ts) **lança no boot** se faltarem — [App.tsx](src/App.tsx) renderiza tela de erro quando `hasSupabaseEnv` é falso. Nunca exponha `service_role` ao frontend; ela é usada só nas Edge Functions.

## Arquitetura — o que precisa ser entendido lendo vários arquivos

### Autorização: RLS é a fonte de verdade, não o frontend

Toda tabela tem RLS ativada com `deny-all` por padrão. Cada vendedor vê apenas registros onde `vendedor_id = auth.uid()`. Admin é checado via função SQL `is_admin()` que consulta a tabela `perfis` — **nunca** via JWT claims (ver [supabase/schema.sql](supabase/schema.sql:237-245)). Consequência prática: o frontend pode mandar qualquer query sem filtro de `vendedor_id` que o Postgres já restringe; **não** adicione filtros de `vendedor_id` no cliente esperando que sejam a barreira de segurança — eles são otimização/UX, e RLS é a barreira.

Tabelas filhas verificam propriedade em cascata via EXISTS (ex.: `visita_codigos` checa que a `visita` pertence ao vendedor; `rota_clientes` checa que tanto `rota` quanto `cliente` pertencem ao vendedor). Ao adicionar tabelas, replique esse padrão no SQL.

### Camadas de proteção de rota

1. [ProtectedRoute](src/components/ProtectedRoute.tsx) — exige `user` autenticado; se `perfil.must_change_password`, força redirect para `/trocar-senha`.
2. [Layout](src/components/Layout.tsx) — shell de UI; aplica [`useInactivityTimeout`](src/hooks/useInactivityTimeout.ts) (signOut após 30 min sem eventos do usuário).
3. [AdminRoute](src/components/AdminRoute.tsx) — bloqueia rotas `/admin/*` para `perfil.role !== 'admin'`.

`AuthContext` ([src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)) escuta `onAuthStateChange` e busca o `perfil` (com `ativo === true` obrigatório — vendedor desativado é deslogado automaticamente).

### Fluxo de pedido / numero_pedido

Cada `visita` recebe um `numero_pedido` sequencial **por vendedor** atribuído por trigger `BEFORE INSERT` que chama `proximo_numero_pedido()` (SECURITY DEFINER, mantém a sequência em `pedido_sequencia_vendedor`). Não tente gerar o número no cliente. O campo `tipo_visita` distingue:

- `pedido` — pedido firme; gera número e PDF.
- `orcamento` — orçamento; gera número e PDF, sem firmar venda.
- `visita` — apenas registro de visita; **não** consome número de pedido (`numero_pedido` fica null).

`enviado_representada_em` (timestamptz) marca quando o vendedor enviou o pedido pelo WhatsApp para a Representada via [src/lib/representada.ts](src/lib/representada.ts) (`linkRepresentadaWhatsApp`).

### Rotas: template vs. execução

Modelagem em três tabelas — não confunda os papéis:

- `rotas` — **template** (lista nomeada e ordenada de clientes para visitar).
- `rota_clientes` — conteúdo do template (paradas com `ordem`).
- `rota_execucoes` — uma instância em andamento ou finalizada (`iniciada_em`, `finalizada_em`).

Visitas feitas durante uma execução guardam `rota_execucao_id` (FK opcional). Há índice parcial `WHERE finalizada_em IS NULL` pra encontrar rapidamente a execução ativa do vendedor.

### Ciclo de rotas / "rodada de lista"

[src/lib/ciclo.ts](src/lib/ciclo.ts) implementa dois modos de checklist mutuamente exclusivos sobre `rota_execucoes`:

- **Ciclo de dias** (`perfis.ciclo_dias`, default 7): rota é "feita" se finalizada nos últimos N dias; pendente fora disso, com cálculo de atraso.
- **Modo lista rodada** (`perfis.lista_rodada_desde` não-null): janela por timestamp em vez de dias — rota conta como feita se houve execução finalizada após `lista_rodada_desde`. "Resetar a rodada" é atualizar esse timestamp.

Sempre passe os dois campos do perfil ao chamar `calcularStatusCiclo`.

### Edge Functions (operações privilegiadas)

Vivem em [supabase/functions/](supabase/functions/) e rodam com `service_role`. São o único caminho permitido para:

- `criar-vendedor` — cria usuário em `auth.users` + `perfis`, senha temporária, força `must_change_password`. Valida senha (≥12 chars, maiúscula, número, especial) e CORS por origem.
- `trocar-senha` — fluxo seguro de troca; também grava em `audit_log`.
- `verificar-role` — consulta autoritativa de role (não confiar no perfil cacheado para decisões críticas).

`audit_log` é insert-only via service role — RLS bloqueia inserção pelo cliente.

### Schema e migrações

[supabase/schema.sql](supabase/schema.sql) é o **DDL completo e idempotente** para subir um projeto do zero (consolidado de todas as migrations). As `migration-*.sql` no mesmo diretório são deltas aplicados manualmente no SQL Editor do Supabase Dashboard em projetos existentes — **não** existe pipeline automatizado (sem `supabase db push`, sem Drizzle/Prisma). Ao adicionar uma feature de banco:

1. Atualize `schema.sql` para refletir o estado final consolidado.
2. Crie um `migration-<feature>.sql` idempotente (uso de `IF NOT EXISTS` / `CREATE OR REPLACE` / blocos `DO`) com o delta para projetos já existentes.
3. Migrations recentes incluem RPCs transacionais (`replace_visita_codigos`, `replace_cliente_contatos`, `replace_rota_clientes`) — ver "Padrão de substituição em massa" abaixo.

### Padrão de substituição em massa (delete + insert)

Para tabelas filhas que sobrescrevem tudo no save (`visita_codigos`, `cliente_contatos`, `rota_clientes`), **nunca** faça `delete()` seguido de `insert()` em duas chamadas separadas — se o insert falhar, os dados originais somem silenciosamente. Use os RPCs `replace_visita_codigos` / `replace_cliente_contatos` / `replace_rota_clientes` que rodam em uma transação. Eles validam ownership internamente (vendedor da entidade pai ou admin).

### PWA e cache

Workbox config em [vite.config.ts](vite.config.ts):

- `/rest/v1/*` — `NetworkFirst` com TTL de 5 min e timeout de 5 s (offline-friendly para reads).
- `/auth/v1/*` e `/functions/v1/*` — `NetworkOnly` (nunca cache; bypass obrigatório).

Headers de segurança e CSP em [vercel.json](vercel.json) — a CSP libera as APIs externas usadas para preencher cliente automaticamente: `brasilapi.com.br`, `api.opencnpj.org`, `viacep.com.br` (ver [src/lib/cep.ts](src/lib/cep.ts), [src/lib/cnpj.ts](src/lib/cnpj.ts)). Adicionar nova API externa exige editar `connect-src`.

### PDFs e Excel

- [src/lib/pedidoPdf.ts](src/lib/pedidoPdf.ts) gera PDF do pedido com `jspdf` + `jspdf-autotable`. Cabeçalho fixo de Representada em [src/lib/pedidoPdfConfig.ts](src/lib/pedidoPdfConfig.ts).
- [src/lib/sharePedido.ts](src/lib/sharePedido.ts) usa Web Share API quando disponível.
- Catálogo de `produtos` é importável via Excel (`xlsx`) na tela admin; helpers de parsing (`getCell`, `parsePreco`, `parsePercentInput`) em [src/lib/utils.ts](src/lib/utils.ts).
- [src/lib/fixUtf8Mojibake.ts](src/lib/fixUtf8Mojibake.ts) corrige descrições de produto com encoding latin-1↔utf-8 quebrado vindas de planilhas.

### Convenções de código

- TypeScript estrito mas `noUnusedLocals`/`noUnusedParameters` desligados.
- `verbatimModuleSyntax: true` — use `import type` para tipos.
- Sem barrels; importe direto do arquivo.
- Estilo do projeto: Tailwind utility-first, sem CSS modules. Cor primária `primary-*` (definida em [src/index.css](src/index.css)).
- `lucide-react` para ícones, `react-hot-toast` para feedback, `@dnd-kit/*` para reordenação drag-and-drop.

### Reuso de "últimas condições"

[VisitaForm](src/pages/VisitaForm.tsx) suporta reusar as condições de pagamento da última visita do mesmo cliente (commit recente). Ao mexer em fluxo de pedido, verifique se isso continua válido.

## Comportamentos a preservar (consequências de incidentes/decisões)

- **Mensagens de login genéricas**: `signIn` retorna sempre "E-mail ou senha inválidos" — não diferencie usuário inexistente vs senha errada (anti-enumeração).
- **`must_change_password` é gate global**: qualquer rota protegida que não seja `/trocar-senha` redireciona enquanto a flag for `true`. Não adicione exceções.
- **Limite de 200 códigos por visita**: trigger `trg_max_codigos` no banco — antes de aumentar, confirme que a UI suporta e que o PDF não estoura página.
- **Normalização de código**: sempre passe códigos por `normCodigo` ([src/lib/utils.ts](src/lib/utils.ts)) antes de comparar — banco usa `lower(trim(codigo))` no índice único de `produtos`.
- **Datas em fuso BR**: para gravar a data de hoje, use `dataLocalIso()`; para formatar data string `'YYYY-MM-DD'` para exibição, use `formatarDataBr()`. Ambas em [src/lib/utils.ts](src/lib/utils.ts). `new Date().toISOString().split('T')[0]` é UTC e dá dia errado à noite no Brasil; `new Date('YYYY-MM-DD').toLocaleDateString()` mostra o dia anterior.
- **Telefone/email de cliente**: prefira sempre `cliente.contatos[]` (de `cliente_contatos`); só caia para `clientes.telefone`/`clientes.email` legados como fallback.
