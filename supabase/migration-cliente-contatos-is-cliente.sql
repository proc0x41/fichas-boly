-- ============================================================
-- Múltiplos contatos (telefones/emails) por cliente +
-- flag is_cliente para distinguir clientes ativos de prospects.
-- ============================================================

-- 1. Flag is_cliente na tabela clientes
--    true  = já é cliente (padrão para linhas existentes)
--    false = prospect / loja visitada para prospecção
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS is_cliente boolean NOT NULL DEFAULT true;

-- 2. Tabela de contatos múltiplos
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

-- 3. RLS — mesmas regras dos clientes (vendedor vê apenas os seus)
ALTER TABLE cliente_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_own_contatos" ON cliente_contatos;
CREATE POLICY "vendedor_own_contatos"
  ON cliente_contatos
  FOR ALL
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

-- Admins têm acesso total
DROP POLICY IF EXISTS "admin_all_contatos" ON cliente_contatos;
CREATE POLICY "admin_all_contatos"
  ON cliente_contatos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.user_id = auth.uid() AND p.role = 'admin'
    )
  );
