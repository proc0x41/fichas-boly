-- ============================================================
-- Migração: catálogo de produtos, pedido (número, frete, desconto), estado do cliente
-- Execute no Supabase SQL Editor. Idempotente onde possível.
-- ============================================================

-- 1) Cliente: UF
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS estado text CHECK (estado IS NULL OR char_length(estado) <= 2);

-- 2) Perfil: telefone do vendedor (rodapé do PDF)
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS telefone text CHECK (telefone IS NULL OR char_length(telefone) <= 30);

-- 3) Catálogo de produtos
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

DROP TRIGGER IF EXISTS trg_produtos_atualizado ON produtos;
CREATE OR REPLACE FUNCTION set_produtos_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_produtos_atualizado
  BEFORE UPDATE ON produtos
  FOR EACH ROW
  EXECUTE FUNCTION set_produtos_atualizado_em();

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

-- 4) Sequência de número de pedido por vendedor
CREATE TABLE IF NOT EXISTS pedido_sequencia_vendedor (
  vendedor_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  ultimo_numero int NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

ALTER TABLE pedido_sequencia_vendedor ENABLE ROW LEVEL SECURITY;

-- Sem políticas SELECT: só função SECURITY DEFINER acessa

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
-- Apenas o trigger SECURITY DEFINER chama proximo_numero_pedido (vendedor não chama direto).

-- 5) Visitas: número do pedido, frete, desconto
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS numero_pedido int,
  ADD COLUMN IF NOT EXISTS valor_frete numeric(14, 2) NOT NULL DEFAULT 0 CHECK (valor_frete >= 0),
  ADD COLUMN IF NOT EXISTS desconto_percent numeric(5, 2) NOT NULL DEFAULT 0 CHECK (desconto_percent >= 0 AND desconto_percent <= 100);

-- Backfill número para visitas existentes
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY vendedor_id ORDER BY criado_em) AS rn
  FROM visitas
  WHERE numero_pedido IS NULL
)
UPDATE visitas v
SET numero_pedido = numbered.rn
FROM numbered
WHERE v.id = numbered.id;

INSERT INTO pedido_sequencia_vendedor (vendedor_id, ultimo_numero)
SELECT vendedor_id, COALESCE(MAX(numero_pedido), 0)
FROM visitas
GROUP BY vendedor_id
ON CONFLICT (vendedor_id) DO UPDATE
  SET ultimo_numero = GREATEST(
    pedido_sequencia_vendedor.ultimo_numero,
    EXCLUDED.ultimo_numero
  );

CREATE OR REPLACE FUNCTION visitas_assign_numero_pedido()
RETURNS TRIGGER AS $$
BEGIN
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

ALTER TABLE visitas ALTER COLUMN numero_pedido SET NOT NULL;

COMMENT ON COLUMN visitas.numero_pedido IS 'Sequência por vendedor (atribuída no INSERT).';
COMMENT ON COLUMN visitas.valor_frete IS 'Frete informado na visita.';
COMMENT ON COLUMN visitas.desconto_percent IS 'Desconto único do pedido em % sobre preço de tabela (por linha).';
