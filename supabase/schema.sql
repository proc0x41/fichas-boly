-- ============================================================
-- Fichas Boly — Schema Completo (consolidado das migrations)
-- Execute no Supabase SQL Editor para subir um projeto do zero.
-- Idempotente — pode rodar de novo em projeto existente.
-- ============================================================

-- Extensões usadas para busca acent-insensitive
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper IMMUTABLE para usar unaccent em colunas geradas e índices.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- 1. TABELA DE PERFIS (fonte de verdade para roles)
CREATE TABLE IF NOT EXISTS perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  nome text NOT NULL,
  role text CHECK (role IN ('vendedor', 'admin', 'representada')) DEFAULT 'vendedor' NOT NULL,
  must_change_password boolean DEFAULT true NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  ciclo_dias int NOT NULL DEFAULT 7 CHECK (ciclo_dias BETWEEN 1 AND 60),
  lista_rodada_desde timestamptz,
  telefone text CHECK (telefone IS NULL OR char_length(telefone) <= 30),
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_perfis_user_id ON perfis(user_id);

COMMENT ON COLUMN perfis.lista_rodada_desde IS
  'Início da rodada atual da checklist; finalizações anteriores não contam para "feita". NULL = usa apenas o ciclo em dias.';

-- 2. CLIENTES (frente da ficha física)
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  fantasia text NOT NULL CHECK (char_length(fantasia) <= 200),
  razao_social text CHECK (char_length(razao_social) <= 200),
  cnpj text CHECK (char_length(cnpj) <= 18),
  inscricao_estadual text CHECK (char_length(inscricao_estadual) <= 20),
  endereco text CHECK (char_length(endereco) <= 300),
  numero text CHECK (char_length(numero) <= 20),
  complemento text CHECK (char_length(complemento) <= 100),
  bairro text CHECK (char_length(bairro) <= 100),
  cidade text CHECK (char_length(cidade) <= 100),
  cep text CHECK (char_length(cep) <= 10),
  estado text CHECK (estado IS NULL OR char_length(estado) <= 2),
  -- Campos legados (preferir usar `cliente_contatos`).
  telefone text CHECK (char_length(telefone) <= 20),
  email text CHECK (char_length(email) <= 200),
  comprador text CHECK (char_length(comprador) <= 200),
  dia_compras text CHECK (char_length(dia_compras) <= 50),
  cliente_desde date,
  is_cliente boolean NOT NULL DEFAULT true,
  display_chao int DEFAULT 0 NOT NULL CHECK (display_chao >= 0),
  display_balcao int DEFAULT 0 NOT NULL CHECK (display_balcao >= 0),
  display_parede int DEFAULT 0 NOT NULL CHECK (display_parede >= 0),
  total_itens int GENERATED ALWAYS AS (display_chao + display_balcao + display_parede) STORED,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL,
  -- Coluna gerada para busca acento-insensitive (lower + unaccent).
  search_text text GENERATED ALWAYS AS (
    lower(public.f_unaccent(
      coalesce(fantasia, '') || ' ' ||
      coalesce(razao_social, '') || ' ' ||
      coalesce(comprador, '') || ' ' ||
      coalesce(endereco, '') || ' ' ||
      coalesce(bairro, '') || ' ' ||
      coalesce(cidade, '') || ' ' ||
      coalesce(estado, '') || ' ' ||
      coalesce(email, '')
    ))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_clientes_vendedor ON clientes(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_fantasia ON clientes(fantasia);
CREATE INDEX IF NOT EXISTS idx_clientes_bairro ON clientes(bairro);
CREATE INDEX IF NOT EXISTS idx_clientes_search_text_trgm
  ON clientes USING gin (search_text gin_trgm_ops);

-- 2b. CLIENTE_CONTATOS (telefones/emails múltiplos por cliente)
CREATE TABLE IF NOT EXISTS cliente_contatos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  tipo       text NOT NULL CHECK (tipo IN ('telefone', 'email')),
  valor      text NOT NULL CHECK (char_length(valor) >= 1 AND char_length(valor) <= 200),
  rotulo     text CHECK (rotulo IS NULL OR char_length(rotulo) <= 100),
  ordem      int  NOT NULL DEFAULT 0,
  criado_em  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_cliente ON cliente_contatos(cliente_id);

-- 2c. CLIENTE_ESTOQUE (produtos que o cliente tem em estoque)
CREATE TABLE IF NOT EXISTS cliente_estoque (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  codigo     text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20),
  quantidade int  NOT NULL DEFAULT 1 CHECK (quantidade > 0 AND quantidade <= 99999),
  criado_em  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cliente_estoque_cliente ON cliente_estoque(cliente_id);

-- 3. VISITAS (cada uso da ficha = um pedido/orçamento/visita)
CREATE TABLE IF NOT EXISTS visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  data_visita date NOT NULL DEFAULT CURRENT_DATE,
  status text CHECK (status IN ('pendente', 'visitado', 'nao_encontrado', 'reagendado')) DEFAULT 'pendente' NOT NULL,
  tipo_visita text NOT NULL DEFAULT 'pedido' CHECK (tipo_visita IN ('pedido', 'orcamento', 'visita')),
  observacao text CHECK (char_length(observacao) <= 2000),
  condicoes_pagamento text CHECK (char_length(condicoes_pagamento) <= 500),
  rota_execucao_id uuid, -- FK adicionada após criar rota_execucoes
  -- Null em visitas do tipo 'visita' (não consome a sequência de pedido).
  numero_pedido int,
  valor_frete numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor_frete >= 0),
  desconto_percent numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (desconto_percent >= 0 AND desconto_percent <= 100),
  enviado_representada_em timestamptz,
  compartilhado_em timestamptz,
  nota_emitida_em timestamptz,
  criado_em timestamptz DEFAULT now() NOT NULL
);

COMMENT ON COLUMN visitas.desconto_percent IS
  'Desconto único do pedido em % sobre o preço de tabela (por linha).';
COMMENT ON COLUMN visitas.enviado_representada_em IS
  'Quando preenchido, indica que o pedido já foi enviado para a Representada (badge na lista de Pedidos).';
COMMENT ON COLUMN visitas.compartilhado_em IS
  'Quando preenchido, indica que o vendedor compartilhou o pedido com a Representada para emissão de NF. Toggle pelo vendedor.';
COMMENT ON COLUMN visitas.nota_emitida_em IS
  'Quando preenchido, indica que a Representada marcou a NF como emitida. Toggle pela Representada via RPC marcar_nota_emitida.';

CREATE INDEX IF NOT EXISTS idx_visitas_cliente ON visitas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor ON visitas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_data ON visitas(data_visita DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_execucao ON visitas(rota_execucao_id);
CREATE INDEX IF NOT EXISTS idx_visitas_compartilhado
  ON visitas(compartilhado_em DESC)
  WHERE compartilhado_em IS NOT NULL;

-- 4. CÓDIGOS DE PRODUTO POR VISITA (verso da ficha)
CREATE TABLE IF NOT EXISTS visita_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid REFERENCES visitas ON DELETE CASCADE NOT NULL,
  codigo text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20),
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade > 0 AND quantidade <= 9999),
  -- Desconto % específico do item. NULL = herda visitas.desconto_percent (global);
  -- 0 = item explicitamente sem desconto mesmo havendo desconto global.
  desconto_percent_override numeric(5, 2)
    CHECK (desconto_percent_override IS NULL
           OR (desconto_percent_override >= 0 AND desconto_percent_override <= 100))
);

ALTER TABLE public.visita_codigos ADD COLUMN IF NOT EXISTS preco_unitario numeric(14,4)
  CHECK (preco_unitario IS NULL OR preco_unitario >= 0);
COMMENT ON COLUMN public.visita_codigos.preco_unitario IS
  'Preço de tabela capturado no servidor na inclusão. NULL = histórico estimado pelo catálogo atual.';


CREATE INDEX IF NOT EXISTS idx_visita_codigos_visita ON visita_codigos(visita_id);

-- Trigger: limita 1000 códigos por visita
CREATE OR REPLACE FUNCTION check_max_codigos_per_visita()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM visita_codigos WHERE visita_id = NEW.visita_id) >= 1000 THEN
    RAISE EXCEPTION 'Limite de 1000 códigos por visita atingido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_codigos ON visita_codigos;
CREATE TRIGGER trg_max_codigos
  BEFORE INSERT ON visita_codigos
  FOR EACH ROW
  EXECUTE FUNCTION check_max_codigos_per_visita();

-- 5. ROTAS (template reutilizável = agrupamento ordenado de clientes)
CREATE TABLE IF NOT EXISTS rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  nome text NOT NULL CHECK (char_length(nome) <= 100),
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  data_rota date, -- legado/opcional: rotas-template não precisam de data
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rotas_vendedor ON rotas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_rotas_ordem ON rotas(vendedor_id, ordem);

-- 6. CLIENTES DENTRO DE UMA ROTA (conteúdo do template)
CREATE TABLE IF NOT EXISTS rota_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES rotas ON DELETE CASCADE NOT NULL,
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  ordem int NOT NULL CHECK (ordem >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rota_clientes_rota ON rota_clientes(rota_id);

-- 6b. EXECUÇÕES DE ROTA (cada vez que o vendedor "inicia" uma rota)
CREATE TABLE IF NOT EXISTS rota_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES rotas ON DELETE CASCADE NOT NULL,
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rota_execucoes_rota ON rota_execucoes(rota_id);
CREATE INDEX IF NOT EXISTS idx_rota_execucoes_vendedor_ativa
  ON rota_execucoes(vendedor_id)
  WHERE finalizada_em IS NULL;

-- FK de visitas.rota_execucao_id (criada aqui, pós rota_execucoes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'visitas_rota_execucao_id_fkey'
  ) THEN
    ALTER TABLE visitas
      ADD CONSTRAINT visitas_rota_execucao_id_fkey
      FOREIGN KEY (rota_execucao_id) REFERENCES rota_execucoes ON DELETE SET NULL;
  END IF;
END $$;

-- Sequência de número de pedido por vendedor
CREATE TABLE IF NOT EXISTS pedido_sequencia_vendedor (
  vendedor_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  ultimo_numero int NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

ALTER TABLE pedido_sequencia_vendedor ENABLE ROW LEVEL SECURITY;
-- Sem políticas SELECT: apenas a função SECURITY DEFINER pode acessar.

CREATE OR REPLACE FUNCTION proximo_numero_pedido()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vid uuid := auth.uid();
  novo int;
BEGIN
  IF vid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  INSERT INTO pedido_sequencia_vendedor (vendedor_id, ultimo_numero)
  VALUES (vid, 1)
  ON CONFLICT (vendedor_id) DO UPDATE
    SET ultimo_numero = pedido_sequencia_vendedor.ultimo_numero + 1
  RETURNING ultimo_numero INTO novo;
  RETURN novo;
END;
$$;

REVOKE ALL ON FUNCTION proximo_numero_pedido() FROM PUBLIC;

-- Trigger: atribui numero_pedido automaticamente em INSERT,
-- exceto para tipo_visita = 'visita' (que não consome sequência).
CREATE OR REPLACE FUNCTION visitas_assign_numero_pedido()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_visita = 'visita' THEN
    NEW.numero_pedido := NULL;
    RETURN NEW;
  END IF;
  IF NEW.numero_pedido IS NULL THEN
    NEW.numero_pedido := proximo_numero_pedido();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_visitas_numero_pedido ON visitas;
CREATE TRIGGER trg_visitas_numero_pedido
  BEFORE INSERT ON visitas
  FOR EACH ROW
  EXECUTE FUNCTION visitas_assign_numero_pedido();

-- Catálogo de produtos (PDF / Mercos)
CREATE TABLE IF NOT EXISTS produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20),
  descricao text NOT NULL CHECK (char_length(descricao) <= 500),
  preco_tabela numeric(14, 4) NOT NULL CHECK (preco_tabela >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_unique ON produtos (lower(trim(codigo)));
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos (ativo) WHERE ativo = true;

CREATE OR REPLACE FUNCTION set_produtos_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produtos_atualizado ON produtos;
CREATE TRIGGER trg_produtos_atualizado
  BEFORE UPDATE ON produtos
  FOR EACH ROW
  EXECUTE FUNCTION set_produtos_atualizado_em();

-- 7. AUDIT LOG
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  acao text NOT NULL,
  tabela text,
  registro_id uuid,
  payload jsonb,
  ip inet,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_criado ON audit_log(criado_em DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper: função para checar se o usuário é admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE user_id = auth.uid()
    AND role = 'admin'
    AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: função para checar se o usuário é da Representada (emite NF dos pedidos compartilhados)
CREATE OR REPLACE FUNCTION is_representada()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE user_id = auth.uid()
    AND role = 'representada'
    AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -------------------- PERFIS --------------------
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perfis_select_own" ON perfis;
CREATE POLICY "perfis_select_own" ON perfis FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "perfis_update_own" ON perfis;
CREATE POLICY "perfis_update_own" ON perfis FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_perfis" ON perfis;
CREATE POLICY "admin_all_perfis" ON perfis FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Representada vê os perfis dos vendedores (para mostrar quem emitiu o pedido).
DROP POLICY IF EXISTS "representada_select_vendedores" ON perfis;
CREATE POLICY "representada_select_vendedores" ON perfis FOR SELECT
  TO authenticated
  USING (is_representada() AND role = 'vendedor');

-- -------------------- CLIENTES --------------------
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_clientes" ON clientes;
CREATE POLICY "vendedor_select_clientes" ON clientes FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_insert_clientes" ON clientes;
CREATE POLICY "vendedor_insert_clientes" ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_update_clientes" ON clientes;
CREATE POLICY "vendedor_update_clientes" ON clientes FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_delete_clientes" ON clientes;
CREATE POLICY "vendedor_delete_clientes" ON clientes FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_clientes" ON clientes;
CREATE POLICY "admin_all_clientes" ON clientes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Representada vê apenas clientes com pedido compartilhado.
DROP POLICY IF EXISTS "representada_select_clientes" ON clientes;
CREATE POLICY "representada_select_clientes" ON clientes FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.cliente_id = clientes.id
      AND visitas.compartilhado_em IS NOT NULL
      AND visitas.tipo_visita = 'pedido'
    )
  );

-- -------------------- CLIENTE_CONTATOS --------------------
ALTER TABLE cliente_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_own_contatos" ON cliente_contatos;
CREATE POLICY "vendedor_own_contatos"
  ON cliente_contatos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND c.vendedor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_contatos.cliente_id
        AND c.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_all_contatos" ON cliente_contatos;
CREATE POLICY "admin_all_contatos"
  ON cliente_contatos
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "representada_select_contatos" ON cliente_contatos;
CREATE POLICY "representada_select_contatos" ON cliente_contatos FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND EXISTS (
      SELECT 1 FROM visitas v
      WHERE v.cliente_id = cliente_contatos.cliente_id
      AND v.compartilhado_em IS NOT NULL
      AND v.tipo_visita = 'pedido'
    )
  );

-- -------------------- VISITAS --------------------
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_visitas" ON visitas;
CREATE POLICY "vendedor_select_visitas" ON visitas FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_insert_visitas" ON visitas;
CREATE POLICY "vendedor_insert_visitas" ON visitas FOR INSERT
  TO authenticated
  WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM clientes
      WHERE clientes.id = cliente_id
      AND clientes.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_update_visitas" ON visitas;
CREATE POLICY "vendedor_update_visitas" ON visitas FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_delete_visitas" ON visitas;
CREATE POLICY "vendedor_delete_visitas" ON visitas FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_visitas" ON visitas;
CREATE POLICY "admin_all_visitas" ON visitas FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Representada vê apenas pedidos compartilhados (tipo_visita='pedido').
DROP POLICY IF EXISTS "representada_select_visitas" ON visitas;
CREATE POLICY "representada_select_visitas" ON visitas FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND compartilhado_em IS NOT NULL
    AND tipo_visita = 'pedido'
  );

-- -------------------- CLIENTE_ESTOQUE --------------------
ALTER TABLE cliente_estoque ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_own_estoque" ON cliente_estoque;
CREATE POLICY "vendedor_own_estoque"
  ON cliente_estoque
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_estoque.cliente_id
        AND c.vendedor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clientes c
      WHERE c.id = cliente_estoque.cliente_id
        AND c.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_all_estoque" ON cliente_estoque;
CREATE POLICY "admin_all_estoque"
  ON cliente_estoque
  FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- VISITA_CODIGOS --------------------
ALTER TABLE visita_codigos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_codigos" ON visita_codigos;
CREATE POLICY "vendedor_select_codigos" ON visita_codigos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_insert_codigos" ON visita_codigos;
CREATE POLICY "vendedor_insert_codigos" ON visita_codigos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_delete_codigos" ON visita_codigos;
CREATE POLICY "vendedor_delete_codigos" ON visita_codigos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_all_codigos" ON visita_codigos;
CREATE POLICY "admin_all_codigos" ON visita_codigos FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "representada_select_codigos" ON visita_codigos;
CREATE POLICY "representada_select_codigos" ON visita_codigos FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_codigos.visita_id
      AND visitas.compartilhado_em IS NOT NULL
      AND visitas.tipo_visita = 'pedido'
    )
  );

-- -------------------- PRODUTOS --------------------
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_produtos" ON public.produtos;
CREATE POLICY "vendedor_select_produtos" ON public.produtos FOR SELECT TO authenticated
  USING (ativo OR public.is_admin() OR EXISTS (
    SELECT 1 FROM public.visita_codigos vc JOIN public.visitas v ON v.id = vc.visita_id
    WHERE lower(trim(vc.codigo)) = lower(trim(produtos.codigo))
      AND (v.vendedor_id = auth.uid() OR (public.is_representada()
        AND v.tipo_visita = 'pedido' AND v.compartilhado_em IS NOT NULL))
  ));

DROP POLICY IF EXISTS "admin_all_produtos" ON produtos;
CREATE POLICY "admin_all_produtos" ON produtos FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- ROTAS --------------------
ALTER TABLE rotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_rotas" ON rotas;
CREATE POLICY "vendedor_select_rotas" ON rotas FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_insert_rotas" ON rotas;
CREATE POLICY "vendedor_insert_rotas" ON rotas FOR INSERT
  TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_update_rotas" ON rotas;
CREATE POLICY "vendedor_update_rotas" ON rotas FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_delete_rotas" ON rotas;
CREATE POLICY "vendedor_delete_rotas" ON rotas FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_rotas" ON rotas;
CREATE POLICY "admin_all_rotas" ON rotas FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- ROTA_CLIENTES --------------------
ALTER TABLE rota_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_rota_clientes" ON rota_clientes;
CREATE POLICY "vendedor_select_rota_clientes" ON rota_clientes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_insert_rota_clientes" ON rota_clientes;
CREATE POLICY "vendedor_insert_rota_clientes" ON rota_clientes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM clientes
      WHERE clientes.id = cliente_id
      AND clientes.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_update_rota_clientes" ON rota_clientes;
CREATE POLICY "vendedor_update_rota_clientes" ON rota_clientes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_delete_rota_clientes" ON rota_clientes;
CREATE POLICY "vendedor_delete_rota_clientes" ON rota_clientes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_all_rota_clientes" ON rota_clientes;
CREATE POLICY "admin_all_rota_clientes" ON rota_clientes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- ROTA_EXECUCOES --------------------
ALTER TABLE rota_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_select_execucoes" ON rota_execucoes FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_insert_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_insert_execucoes" ON rota_execucoes FOR INSERT
  TO authenticated
  WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_update_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_update_execucoes" ON rota_execucoes FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_delete_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_delete_execucoes" ON rota_execucoes FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_execucoes" ON rota_execucoes;
CREATE POLICY "admin_all_execucoes" ON rota_execucoes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- AUDIT_LOG --------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admin pode ler. Inserção apenas via service role (Edge Functions).
DROP POLICY IF EXISTS "admin_select_audit" ON audit_log;
CREATE POLICY "admin_select_audit" ON audit_log FOR SELECT
  TO authenticated
  USING (is_admin());

-- ============================================================
-- RPCs transacionais (substituem o padrão delete-then-insert
-- usado no frontend, evitando perda silenciosa de dados se o
-- INSERT falhar entre as duas chamadas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.replace_visita_codigos(p_visita_id uuid, p_codigos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vendedor uuid;
BEGIN
  IF p_codigos IS NULL OR jsonb_typeof(p_codigos) <> 'array' THEN
    RAISE EXCEPTION 'p_codigos deve ser um array JSON';
  END IF;
  -- Serializa edições do mesmo pedido, preservando o preço dos itens mantidos.
  SELECT vendedor_id INTO v_vendedor FROM public.visitas WHERE id = p_visita_id FOR UPDATE;
  IF v_vendedor IS NULL THEN RAISE EXCEPTION 'Visita não encontrada'; END IF;
  IF auth.uid() IS NULL OR (v_vendedor <> auth.uid() AND NOT public.is_admin()) THEN
    RAISE EXCEPTION 'Não autorizado' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_codigos) c
    GROUP BY lower(trim(c->>'codigo')) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Códigos duplicados';
  END IF;
  DELETE FROM public.visita_codigos vc WHERE visita_id = p_visita_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_codigos) c
      WHERE lower(trim(c->>'codigo')) = lower(trim(vc.codigo)));
  UPDATE public.visita_codigos vc SET quantidade = (c->>'quantidade')::int,
    desconto_percent_override = (c->>'desconto_percent_override')::numeric
    FROM jsonb_array_elements(p_codigos) c WHERE visita_id = p_visita_id
      AND lower(trim(c->>'codigo')) = lower(trim(vc.codigo));
  INSERT INTO public.visita_codigos (visita_id, codigo, quantidade, desconto_percent_override)
    SELECT p_visita_id, trim(c->>'codigo'), (c->>'quantidade')::int,
      (c->>'desconto_percent_override')::numeric
    FROM jsonb_array_elements(p_codigos) c
    WHERE NOT EXISTS (SELECT 1 FROM public.visita_codigos vc WHERE visita_id = p_visita_id
      AND lower(trim(vc.codigo)) = lower(trim(c->>'codigo')));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_visita_codigos(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_visita_codigos(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION replace_cliente_contatos(
  p_cliente_id uuid,
  p_contatos   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedor uuid;
BEGIN
  IF p_contatos IS NULL OR jsonb_typeof(p_contatos) <> 'array' THEN
    RAISE EXCEPTION 'p_contatos deve ser um array JSON';
  END IF;

  SELECT vendedor_id INTO v_vendedor FROM clientes WHERE id = p_cliente_id;
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;
  IF v_vendedor <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  DELETE FROM cliente_contatos WHERE cliente_id = p_cliente_id;

  IF jsonb_array_length(p_contatos) > 0 THEN
    INSERT INTO cliente_contatos (cliente_id, tipo, valor, rotulo, ordem)
    SELECT
      p_cliente_id,
      c->>'tipo',
      btrim(c->>'valor'),
      NULLIF(btrim(coalesce(c->>'rotulo', '')), ''),
      coalesce((c->>'ordem')::int, 0)
    FROM jsonb_array_elements(p_contatos) AS c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_cliente_contatos(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_cliente_contatos(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION replace_cliente_estoque(
  p_cliente_id uuid,
  p_itens      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedor uuid;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RAISE EXCEPTION 'p_itens deve ser um array JSON';
  END IF;

  SELECT vendedor_id INTO v_vendedor FROM clientes WHERE id = p_cliente_id;
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado';
  END IF;
  IF v_vendedor <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  DELETE FROM cliente_estoque WHERE cliente_id = p_cliente_id;

  IF jsonb_array_length(p_itens) > 0 THEN
    INSERT INTO cliente_estoque (cliente_id, codigo, quantidade)
    SELECT
      p_cliente_id,
      btrim(c->>'codigo'),
      (c->>'quantidade')::int
    FROM jsonb_array_elements(p_itens) AS c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_cliente_estoque(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_cliente_estoque(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION replace_rota_clientes(
  p_rota_id  uuid,
  p_paradas  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedor uuid;
BEGIN
  IF p_paradas IS NULL OR jsonb_typeof(p_paradas) <> 'array' THEN
    RAISE EXCEPTION 'p_paradas deve ser um array JSON';
  END IF;

  SELECT vendedor_id INTO v_vendedor FROM rotas WHERE id = p_rota_id;
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Rota não encontrada';
  END IF;
  IF v_vendedor <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_paradas) AS c
    LEFT JOIN clientes cli ON cli.id = (c->>'cliente_id')::uuid
    WHERE cli.id IS NULL OR cli.vendedor_id <> v_vendedor
  ) THEN
    RAISE EXCEPTION 'Cliente da parada não pertence ao vendedor da rota';
  END IF;

  DELETE FROM rota_clientes WHERE rota_id = p_rota_id;

  IF jsonb_array_length(p_paradas) > 0 THEN
    INSERT INTO rota_clientes (rota_id, cliente_id, ordem)
    SELECT
      p_rota_id,
      (c->>'cliente_id')::uuid,
      coalesce((c->>'ordem')::int, 0)
    FROM jsonb_array_elements(p_paradas) AS c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_rota_clientes(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_rota_clientes(uuid, jsonb) TO authenticated;

-- ============================================================
-- RPC marcar_nota_emitida — única forma da Representada gravar
-- algo no banco. Toggle entre "emitida" (timestamp) e "pendente"
-- (NULL). RLS impede que ela altere outros campos do pedido.
-- ============================================================

CREATE OR REPLACE FUNCTION marcar_nota_emitida(
  p_visita_id uuid,
  p_marcar    boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_representada() OR is_admin()) THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM visitas
    WHERE id = p_visita_id
    AND compartilhado_em IS NOT NULL
    AND tipo_visita = 'pedido'
  ) THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não compartilhado';
  END IF;

  UPDATE visitas
  SET nota_emitida_em = CASE WHEN p_marcar THEN now() ELSE NULL END
  WHERE id = p_visita_id;
END;
$$;

REVOKE ALL ON FUNCTION marcar_nota_emitida(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marcar_nota_emitida(uuid, boolean) TO authenticated;

-- Métricas administrativas e captura de preços históricos
-- Também protege inserções diretas: o cliente não escolhe o preço histórico.
CREATE OR REPLACE FUNCTION public.visita_codigo_preco_historico()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT preco_tabela INTO NEW.preco_unitario FROM public.produtos
      WHERE lower(trim(codigo)) = lower(trim(NEW.codigo));
  ELSE
    IF NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.visita_id IS DISTINCT FROM OLD.visita_id THEN
      RAISE EXCEPTION 'Remova e adicione o item para trocar seu código ou pedido';
    END IF;
    NEW.preco_unitario := OLD.preco_unitario;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_visita_codigo_preco ON public.visita_codigos;
CREATE TRIGGER trg_visita_codigo_preco BEFORE INSERT OR UPDATE ON public.visita_codigos
  FOR EACH ROW EXECUTE FUNCTION public.visita_codigo_preco_historico();

-- Retorna um objeto JSON: não está sujeito ao limite de linhas do PostgREST.
-- Busca afeta somente a tabela/exportação; participação é sobre todas as vendas.
CREATE OR REPLACE FUNCTION public.admin_metricas(
  p_inicio date, p_fim date, p_busca text DEFAULT '',
  p_ordem text DEFAULT 'quantidade', p_direcao text DEFAULT 'desc',
  p_pagina integer DEFAULT 1, p_tamanho integer DEFAULT 20, p_exportar boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_dias integer; v_resultado jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Acesso exclusivo ao administrador' USING ERRCODE = '42501';
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR NOT isfinite(p_inicio) OR NOT isfinite(p_fim)
    OR p_fim < p_inicio OR p_inicio < date '1900-01-01' OR p_fim > date '9999-12-31' THEN
    RAISE EXCEPTION 'Intervalo de datas inválido';
  END IF;
  IF p_ordem IS NULL OR p_ordem NOT IN ('codigo','descricao','quantidade','pedidos','valor','participacao')
    OR p_direcao IS NULL OR p_direcao NOT IN ('asc','desc')
    OR p_pagina IS NULL OR p_pagina < 1 OR p_tamanho IS NULL OR p_tamanho NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Paginação ou ordenação inválida';
  END IF;
  v_dias := p_fim - p_inicio + 1;
  WITH linhas AS MATERIALIZED (
    SELECT v.id, v.cliente_id, v.data_visita, v.tipo_visita, v.valor_frete,
      v.compartilhado_em, v.nota_emitida_em, vc.codigo, vc.quantidade,
      lower(trim(vc.codigo)) AS chave, p.descricao,
      round(coalesce(vc.preco_unitario,p.preco_tabela,0) * coalesce(vc.quantidade,0)
        * (1 - coalesce(vc.desconto_percent_override,v.desconto_percent,0)/100),2) AS valor,
      vc.id IS NOT NULL AND vc.preco_unitario IS NULL AND p.preco_tabela IS NOT NULL AS estimado,
      vc.id IS NOT NULL AND vc.preco_unitario IS NULL AND p.preco_tabela IS NULL AS sem_preco
    FROM public.visitas v LEFT JOIN public.visita_codigos vc ON vc.visita_id = v.id
    LEFT JOIN public.produtos p ON lower(trim(p.codigo)) = lower(trim(vc.codigo))
    WHERE v.data_visita BETWEEN p_inicio - v_dias AND p_fim
      AND v.tipo_visita IN ('pedido','orcamento')
  ), documentos AS MATERIALIZED (
    SELECT id, cliente_id, data_visita, tipo_visita, valor_frete, compartilhado_em, nota_emitida_em,
      sum(valor) AS valor, coalesce(sum(quantidade),0) AS unidades,
      count(*) FILTER (WHERE estimado) AS estimados, count(*) FILTER (WHERE sem_preco) AS sem_preco
    FROM linhas GROUP BY id, cliente_id, data_visita, tipo_visita, valor_frete, compartilhado_em, nota_emitida_em
  ), resumos AS (
    SELECT periodo,
      jsonb_build_object('valor',coalesce(sum(valor),0),'pedidos',count(d.id),
        'ticket',coalesce(round(avg(valor),2),0),'unidades',coalesce(sum(unidades),0),
        'clientes',count(DISTINCT cliente_id),'frete',coalesce(sum(valor_frete),0),
        'estimados',coalesce(sum(estimados),0),'sem_preco',coalesce(sum(sem_preco),0)) AS resumo
    FROM (VALUES ('atual'),('anterior')) periodos(periodo)
    LEFT JOIN documentos d ON d.tipo_visita = 'pedido'
      AND CASE WHEN periodo = 'atual' THEN d.data_visita BETWEEN p_inicio AND p_fim
        ELSE d.data_visita BETWEEN p_inicio - v_dias AND p_inicio - 1 END
    GROUP BY periodo
  ), produtos AS (
    SELECT chave, min(codigo) AS codigo, coalesce(max(descricao),'Não cadastrado') AS descricao,
      sum(quantidade) AS quantidade, count(DISTINCT id) AS pedidos, sum(valor) AS valor,
      count(*) FILTER (WHERE estimado) AS estimados, count(*) FILTER (WHERE sem_preco) AS sem_preco
    FROM linhas WHERE tipo_visita = 'pedido' AND data_visita BETWEEN p_inicio AND p_fim AND codigo IS NOT NULL
    GROUP BY chave
  ), categorias AS (
    SELECT grupo,
      jsonb_build_object('valor',coalesce(sum(l.valor),0),'unidades',coalesce(sum(l.quantidade),0),
        'pedidos',count(DISTINCT l.id),
        'participacao',coalesce(round(sum(l.valor) * 100 / nullif((SELECT sum(valor) FROM produtos),0),2),0),
        'estimados',count(*) FILTER (WHERE l.estimado),'sem_preco',count(*) FILTER (WHERE l.sem_preco)) AS resumo
    FROM (VALUES ('boly'),('importados')) grupos(grupo)
    LEFT JOIN linhas l ON l.tipo_visita = 'pedido' AND l.data_visita BETWEEN p_inicio AND p_fim
      AND l.codigo IS NOT NULL
      AND CASE WHEN l.chave ~ '^[a-z]{2}' THEN 'importados' ELSE 'boly' END = grupo
    GROUP BY grupo
  ), filtrados AS (
    SELECT *, coalesce(round(valor * 100 / nullif((SELECT sum(valor) FROM produtos),0),2),0) AS participacao
    FROM produtos WHERE coalesce(p_busca,'') = ''
      OR strpos(lower(codigo),lower(p_busca)) > 0 OR strpos(lower(descricao),lower(p_busca)) > 0
  ), ordenados AS (
    SELECT *, row_number() OVER (ORDER BY
      CASE WHEN p_direcao = 'asc' THEN CASE p_ordem WHEN 'quantidade' THEN quantidade WHEN 'pedidos' THEN pedidos WHEN 'valor' THEN valor WHEN 'participacao' THEN participacao END END ASC,
      CASE WHEN p_direcao = 'desc' THEN CASE p_ordem WHEN 'quantidade' THEN quantidade WHEN 'pedidos' THEN pedidos WHEN 'valor' THEN valor WHEN 'participacao' THEN participacao END END DESC,
      CASE WHEN p_direcao = 'asc' THEN CASE p_ordem WHEN 'codigo' THEN codigo WHEN 'descricao' THEN descricao END END ASC,
      CASE WHEN p_direcao = 'desc' THEN CASE p_ordem WHEN 'codigo' THEN codigo WHEN 'descricao' THEN descricao END END DESC,
      chave ASC) AS posicao FROM filtrados
  ), buckets AS (
    SELECT generate_series(
      CASE WHEN v_dias <= 90 THEN p_inicio ELSE date_trunc('month',p_inicio::timestamp)::date END,
      p_fim, CASE WHEN v_dias <= 90 THEN interval '1 day' ELSE interval '1 month' END)::date AS data
  ), serie AS (
    SELECT b.data, coalesce(sum(d.valor),0) AS valor, count(d.id) AS pedidos
    FROM buckets b LEFT JOIN documentos d ON d.tipo_visita = 'pedido' AND d.data_visita BETWEEN p_inicio AND p_fim
      AND CASE WHEN v_dias <= 90 THEN d.data_visita ELSE date_trunc('month',d.data_visita::timestamp)::date END = b.data
    GROUP BY b.data
  )
  SELECT jsonb_build_object(
    'inicio',p_inicio,'fim',p_fim,'anterior_inicio',p_inicio-v_dias,'anterior_fim',p_inicio-1,
    'agrupamento',CASE WHEN v_dias <= 90 THEN 'dia' ELSE 'mes' END,
    'resumo',(SELECT resumo FROM resumos WHERE periodo = 'atual'),
    'anterior',(SELECT resumo FROM resumos WHERE periodo = 'anterior'),
    'categorias',(SELECT jsonb_object_agg(grupo,resumo) FROM categorias),
    'pendencias',(SELECT jsonb_build_object(
      'orcamentos',count(*) FILTER (WHERE tipo_visita = 'orcamento'),
      'valor_orcamentos',coalesce(sum(valor) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'frete_orcamentos',coalesce(sum(valor_frete) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'estimados',coalesce(sum(estimados) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'sem_preco',coalesce(sum(sem_preco) FILTER (WHERE tipo_visita = 'orcamento'),0),
      'nao_compartilhados',count(*) FILTER (WHERE tipo_visita = 'pedido' AND compartilhado_em IS NULL),
      'aguardando_nota',count(*) FILTER (WHERE tipo_visita = 'pedido' AND compartilhado_em IS NOT NULL AND nota_emitida_em IS NULL))
      FROM documentos WHERE data_visita BETWEEN p_inicio AND p_fim),
    'serie',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY data),'[]'::jsonb) FROM serie s),
    'total_produtos',(SELECT count(*) FROM filtrados),
    'produtos',(SELECT coalesce(jsonb_agg(to_jsonb(o) - 'chave' - 'posicao' ORDER BY posicao),'[]'::jsonb)
      FROM ordenados o WHERE coalesce(p_exportar,false)
        OR (posicao > (p_pagina::bigint-1)*p_tamanho AND posicao <= p_pagina::bigint*p_tamanho))
  ) INTO v_resultado;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_metricas(date,date,text,text,text,integer,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_metricas(date,date,text,text,text,integer,integer,boolean) TO authenticated;
