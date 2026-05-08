-- ============================================================
-- Conta da Representada — emite NF dos pedidos compartilhados.
--
-- Modelo:
--   - perfis.role agora aceita 'representada' (além de 'vendedor'/'admin').
--   - Vendedor "compartilha" um pedido marcando visitas.compartilhado_em.
--     A representada vê apenas pedidos compartilhados e do tipo 'pedido'
--     (não orçamento, não visita simples).
--   - Representada marca a NF como emitida via RPC marcar_nota_emitida,
--     que grava visitas.nota_emitida_em (ou volta a NULL para desmarcar).
--   - RLS impede a representada de fazer qualquer outra coisa: ela só
--     SELECT em pedidos compartilhados e nas dependências (cliente,
--     contatos, codigos, perfil do vendedor).
-- ============================================================

-- 1. Adiciona 'representada' ao CHECK de perfis.role
ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
ALTER TABLE perfis
  ADD CONSTRAINT perfis_role_check
  CHECK (role IN ('vendedor', 'admin', 'representada'));

-- 2. Helper is_representada()
CREATE OR REPLACE FUNCTION is_representada()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM perfis
    WHERE user_id = auth.uid()
    AND role = 'representada'
    AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Colunas em visitas
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS compartilhado_em timestamptz,
  ADD COLUMN IF NOT EXISTS nota_emitida_em  timestamptz;

COMMENT ON COLUMN visitas.compartilhado_em IS
  'Quando preenchido, indica que o vendedor compartilhou o pedido com a Representada para emissão de NF. Toggle pelo vendedor.';
COMMENT ON COLUMN visitas.nota_emitida_em IS
  'Quando preenchido, indica que a Representada marcou a NF como emitida. Toggle pela Representada via RPC marcar_nota_emitida.';

-- Índice parcial para listagem da representada (pedidos compartilhados)
CREATE INDEX IF NOT EXISTS idx_visitas_compartilhado
  ON visitas(compartilhado_em DESC)
  WHERE compartilhado_em IS NOT NULL;

-- 4. RLS — representada SELECT em visitas compartilhadas (só pedidos)
DROP POLICY IF EXISTS "representada_select_visitas" ON visitas;
CREATE POLICY "representada_select_visitas" ON visitas FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND compartilhado_em IS NOT NULL
    AND tipo_visita = 'pedido'
  );

-- 5. RLS — clientes referenciados por pedidos compartilhados
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

-- 6. RLS — visita_codigos dos pedidos compartilhados
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

-- 7. RLS — cliente_contatos dos clientes referenciados
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

-- 8. RLS — perfis: representada vê os perfis de vendedores (para mostrar "vendedor: X")
DROP POLICY IF EXISTS "representada_select_vendedores" ON perfis;
CREATE POLICY "representada_select_vendedores" ON perfis FOR SELECT
  TO authenticated
  USING (
    is_representada()
    AND role = 'vendedor'
  );

-- 9. RPC marcar_nota_emitida — única forma da representada gravar algo no banco.
--    Aceita p_marcar=true (grava now()) ou false (volta a NULL = desmarcar).
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

  -- Garante que o pedido foi compartilhado (representada só vê esses).
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
