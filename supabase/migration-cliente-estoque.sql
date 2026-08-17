-- Migration: cliente_estoque
-- Adiciona tabela de estoque por cliente (produtos que o cliente tem na loja).

CREATE TABLE IF NOT EXISTS cliente_estoque (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes ON DELETE CASCADE NOT NULL,
  codigo     text NOT NULL CHECK (char_length(codigo) >= 1 AND char_length(codigo) <= 20),
  quantidade int  NOT NULL DEFAULT 1 CHECK (quantidade > 0 AND quantidade <= 99999),
  criado_em  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cliente_estoque_cliente ON cliente_estoque(cliente_id);

-- RLS
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

-- RPC transacional para substituir estoque do cliente
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
