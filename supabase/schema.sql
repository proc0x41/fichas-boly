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
  role text CHECK (role IN ('vendedor', 'admin')) DEFAULT 'vendedor' NOT NULL,
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
  criado_em timestamptz DEFAULT now() NOT NULL
);

COMMENT ON COLUMN visitas.desconto_percent IS
  'Desconto único do pedido em % sobre o preço de tabela (por linha).';
COMMENT ON COLUMN visitas.enviado_representada_em IS
  'Quando preenchido, indica que o pedido já foi enviado para a Representada (badge na lista de Pedidos).';

CREATE INDEX IF NOT EXISTS idx_visitas_cliente ON visitas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor ON visitas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_data ON visitas(data_visita DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_execucao ON visitas(rota_execucao_id);

-- 4. CÓDIGOS DE PRODUTO POR VISITA (verso da ficha)
CREATE TABLE IF NOT EXISTS visita_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid REFERENCES visitas ON DELETE CASCADE NOT NULL,
  codigo text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20),
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade > 0 AND quantidade <= 9999)
);

CREATE INDEX IF NOT EXISTS idx_visita_codigos_visita ON visita_codigos(visita_id);

-- Trigger: limita 200 códigos por visita
CREATE OR REPLACE FUNCTION check_max_codigos_per_visita()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM visita_codigos WHERE visita_id = NEW.visita_id) >= 200 THEN
    RAISE EXCEPTION 'Limite de 200 códigos por visita atingido';
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

-- -------------------- PRODUTOS --------------------
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_produtos" ON produtos;
CREATE POLICY "vendedor_select_produtos" ON produtos FOR SELECT
  TO authenticated
  USING (ativo = true OR is_admin());

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

CREATE OR REPLACE FUNCTION replace_visita_codigos(
  p_visita_id uuid,
  p_codigos   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendedor uuid;
BEGIN
  IF p_codigos IS NULL OR jsonb_typeof(p_codigos) <> 'array' THEN
    RAISE EXCEPTION 'p_codigos deve ser um array JSON';
  END IF;

  SELECT vendedor_id INTO v_vendedor FROM visitas WHERE id = p_visita_id;
  IF v_vendedor IS NULL THEN
    RAISE EXCEPTION 'Visita não encontrada';
  END IF;
  IF v_vendedor <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Não autorizado';
  END IF;

  DELETE FROM visita_codigos WHERE visita_id = p_visita_id;

  IF jsonb_array_length(p_codigos) > 0 THEN
    INSERT INTO visita_codigos (visita_id, codigo, quantidade)
    SELECT
      p_visita_id,
      btrim(c->>'codigo'),
      (c->>'quantidade')::int
    FROM jsonb_array_elements(p_codigos) AS c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_visita_codigos(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_visita_codigos(uuid, jsonb) TO authenticated;

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
