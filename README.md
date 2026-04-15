# Fichas — Sistema de Visita Comercial

Web app PWA mobile-first para vendedores externos da Boly. Substitui fichas físicas de visita comercial por um fluxo 100% digital: cadastro de clientes, registro de visitas com códigos de produto, e montagem de rotas de visita do dia.

## Stack

- **Frontend:** React + Vite + TailwindCSS v4 + TypeScript
- **Backend/BaaS:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Deploy:** Vercel
- **PWA:** vite-plugin-pwa (Workbox)

## Setup Local

### 1. Clonar o repositório

```bash
git clone <repo-url>
cd fichas-boly
npm install
```

### 2. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
2. No **SQL Editor**, execute o conteúdo completo de `supabase/schema.sql`
3. Copie a **URL** e a **anon key** do projeto (Settings > API)

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Edite `.env.local` com os valores reais:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

### 4. Configurações do Supabase Dashboard

No painel do Supabase, configure manualmente:

- **Authentication > Settings:**
  - JWT Expiry: `3600` (1 hora)
  - Enable sign ups: **desativado**
  - Refresh Token Rotation: **ativado**
  - Detect and Revoke (Reuse Interval): **ativado**

### 5. Deploy das Edge Functions

As Edge Functions estão em `supabase/functions/`. Para deploy:

```bash
npx supabase login
npx supabase link --project-ref <seu-ref>
npx supabase functions deploy criar-vendedor
npx supabase functions deploy trocar-senha
npx supabase functions deploy verificar-role
```

### 6. Criar o primeiro admin

No SQL Editor do Supabase, após criar um usuário via Auth > Users:

```sql
INSERT INTO perfis (user_id, nome, role, must_change_password, ativo)
VALUES ('<user-id-do-auth>', 'Admin', 'admin', false, true);
```

### 7. Rodar localmente

```bash
npm run dev
```

Acesse `http://localhost:5173`.

## Deploy na Vercel

1. Conecte o repositório GitHub na Vercel
2. Configure as **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy automático a cada push na branch main

O `vercel.json` já configura os rewrites SPA e headers de segurança (CSP, HSTS, X-Frame-Options, etc.).

## Estrutura do Projeto

```
src/
  components/    # Componentes reutilizáveis (Layout, StatusBadge, ChipInput, etc.)
  contexts/      # AuthContext (autenticação + perfil)
  hooks/         # useInactivityTimeout
  lib/           # Cliente Supabase
  pages/         # Todas as telas da aplicação
    admin/       # Painel admin (vendedores, clientes, rotas)
  types/         # Tipos TypeScript
supabase/
  schema.sql     # DDL completo (tabelas, RLS, triggers)
  functions/     # Edge Functions (criar-vendedor, trocar-senha, verificar-role)
```

## Segurança

- RLS ativado em todas as tabelas com deny-all por padrão
- Vendedor acessa apenas seus próprios registros (`vendedor_id = auth.uid()`)
- Verificação de propriedade em cascata (visita referencia cliente do mesmo vendedor)
- Role de admin consultado via tabela `perfis`, nunca via JWT claims
- Service role key nunca exposta ao frontend
- Headers de segurança (CSP, HSTS, X-Frame-Options, etc.) configurados no Vercel
- Timeout de inatividade de 30 minutos
- Troca de senha obrigatória no primeiro login
- Mensagens de erro de login genéricas (sem enumeração de usuários)
- Audit log para ações sensíveis via Edge Functions
