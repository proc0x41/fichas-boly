-- ============================================================
-- Fichas Boly — Schema Completo
-- Execute no Supabase SQL Editor na ordem apresentada.
-- ============================================================

-- 1. TABELA DE PERFIS (fonte de verdade para roles)
CREATE TABLE perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE UNIQUE NOT NULL,
  nome text NOT NULL,
  role text CHECK (role IN ('vendedor', 'admin')) DEFAULT 'vendedor' NOT NULL,
  must_change_password boolean DEFAULT true NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_perfis_user_id ON perfis(user_id);

-- 2. CLIENTES (frente da ficha física)
CREATE TABLE clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  fantasia text NOT NULL CHECK (char_length(fantasia) <= 200),
  razao_social text CHECK (char_length(razao_social) <= 200),
  cnpj text CHECK (char_length(cnpj) <= 18),
  inscricao_estadual text CHECK (char_length(inscricao_estadual) <= 20),
  endereco text CHECK (char_length(endereco) <= 300),
  numero text CHECK (char_length(numero) <= 20),
  bairro text CHECK (char_length(bairro) <= 100),
  cidade text CHECK (char_length(cidade) <= 100),
  cep text CHECK (char_length(cep) <= 10),
  telefone text CHECK (char_length(telefone) <= 20),
  email text CHECK (char_length(email) <= 200),
  comprador text CHECK (char_length(comprador) <= 200),
  dia_compras text CHECK (char_length(dia_compras) <= 50),
  cliente_desde date,
  display_chao int DEFAULT 0 NOT NULL CHECK (display_chao >= 0),
  display_balcao int DEFAULT 0 NOT NULL CHECK (display_balcao >= 0),
  display_parede int DEFAULT 0 NOT NULL CHECK (display_parede >= 0),
  total_itens int GENERATED ALWAYS AS (display_chao + display_balcao + display_parede) STORED,
  ativo boolean DEFAULT true NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_clientes_vendedor ON clientes(vendedor_id);
CREATE INDEX idx_clientes_fantasia ON clientes(fantasia);
CREATE INDEX idx_clientes_bairro ON clientes(bairro);

-- 3. VISITAS (cada uso da ficha)
CREATE TABLE visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  data_visita date NOT NULL DEFAULT CURRENT_DATE,
  status text CHECK (status IN ('pendente', 'visitado', 'nao_encontrado', 'reagendado')) DEFAULT 'pendente' NOT NULL,
  observacao text CHECK (char_length(observacao) <= 2000),
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_visitas_cliente ON visitas(cliente_id);
CREATE INDEX idx_visitas_vendedor ON visitas(vendedor_id);
CREATE INDEX idx_visitas_data ON visitas(data_visita DESC);

-- 4. CÓDIGOS DE PRODUTO POR VISITA (verso da ficha)
CREATE TABLE visita_codigos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id uuid REFERENCES visitas ON DELETE CASCADE NOT NULL,
  codigo text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20)
);

CREATE INDEX idx_visita_codigos_visita ON visita_codigos(visita_id);

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

CREATE TRIGGER trg_max_codigos
  BEFORE INSERT ON visita_codigos
  FOR EACH ROW
  EXECUTE FUNCTION check_max_codigos_per_visita();

-- 5. ROTAS (grupinho com elástico)
CREATE TABLE rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  nome text NOT NULL CHECK (char_length(nome) <= 100),
  data_rota date NOT NULL,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_rotas_vendedor ON rotas(vendedor_id);
CREATE INDEX idx_rotas_data ON rotas(data_rota DESC);

-- 6. CLIENTES DENTRO DE UMA ROTA
CREATE TABLE rota_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES rotas ON DELETE CASCADE NOT NULL,
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  ordem int NOT NULL CHECK (ordem >= 0),
  visita_id uuid REFERENCES visitas ON DELETE SET NULL
);

CREATE INDEX idx_rota_clientes_rota ON rota_clientes(rota_id);

-- 7. AUDIT LOG
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  acao text NOT NULL,
  tabela text,
  registro_id uuid,
  payload jsonb,
  ip inet,
  criado_em timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_criado ON audit_log(criado_em DESC);

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

CREATE POLICY "perfis_select_own" ON perfis FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "perfis_update_own" ON perfis FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_all_perfis" ON perfis FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- CLIENTES --------------------
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_select_clientes" ON clientes FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

CREATE POLICY "vendedor_insert_clientes" ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendedor_update_clientes" ON clientes FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendedor_delete_clientes" ON clientes FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

CREATE POLICY "admin_all_clientes" ON clientes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- VISITAS --------------------
ALTER TABLE visitas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_select_visitas" ON visitas FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

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

CREATE POLICY "vendedor_update_visitas" ON visitas FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendedor_delete_visitas" ON visitas FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

CREATE POLICY "admin_all_visitas" ON visitas FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- VISITA_CODIGOS --------------------
ALTER TABLE visita_codigos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_select_codigos" ON visita_codigos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

CREATE POLICY "vendedor_insert_codigos" ON visita_codigos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

CREATE POLICY "vendedor_delete_codigos" ON visita_codigos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM visitas
      WHERE visitas.id = visita_id
      AND visitas.vendedor_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_codigos" ON visita_codigos FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- ROTAS --------------------
ALTER TABLE rotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_select_rotas" ON rotas FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

CREATE POLICY "vendedor_insert_rotas" ON rotas FOR INSERT
  TO authenticated
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendedor_update_rotas" ON rotas FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "vendedor_delete_rotas" ON rotas FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

CREATE POLICY "admin_all_rotas" ON rotas FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- ROTA_CLIENTES --------------------
ALTER TABLE rota_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendedor_select_rota_clientes" ON rota_clientes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

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

CREATE POLICY "vendedor_delete_rota_clientes" ON rota_clientes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

CREATE POLICY "admin_all_rota_clientes" ON rota_clientes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------- AUDIT_LOG --------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admin pode ler. Inserção apenas via service role (Edge Functions).
CREATE POLICY "admin_select_audit" ON audit_log FOR SELECT
  TO authenticated
  USING (is_admin());
