-- ============================================================
-- RPCs transacionais para substituir o padrão delete-then-insert
-- usado no frontend (visita_codigos, cliente_contatos, rota_clientes).
--
-- Why: o padrão atual no cliente faz DELETE seguido de INSERT em
-- duas chamadas separadas. Se o INSERT falhar (rede, RLS, validação),
-- o DELETE já foi commitado e os dados originais somem silenciosamente.
--
-- Estas funções rodam tudo numa única transação — falha no INSERT
-- desfaz o DELETE automaticamente.
-- ============================================================

-- ----------------------------------------------------------------
-- replace_visita_codigos(visita_id, [{codigo, quantidade}, ...])
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- replace_cliente_contatos(cliente_id, [{tipo, valor, rotulo, ordem}, ...])
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- replace_rota_clientes(rota_id, [{cliente_id, ordem}, ...])
-- ----------------------------------------------------------------
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

  -- Garante que todos os clientes referenciados pertencem ao mesmo vendedor.
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
