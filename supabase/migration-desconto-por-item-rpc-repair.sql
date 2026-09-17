-- ============================================================
-- Reparo: garante que `replace_visita_codigos` persiste o override
-- de desconto por item (`desconto_percent_override`).
--
-- Quando aplicar: se ao salvar um pedido/orçamento os descontos
-- específicos dos itens (ex.: item com 0%) voltam ao desconto global,
-- o banco está com a versão ANTIGA da função (da
-- migration-rpcs-transacionais.sql), que reinsere os itens sem a coluna
-- e anula os overrides silenciosamente — sem erro no app.
--
-- Como aplicar: rode este arquivo inteiro no SQL Editor do Supabase
-- Dashboard (projeto de produção). Idempotente — pode rodar de novo
-- sem risco. Equivale a reaplicar migration-desconto-por-item.sql.
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
    INSERT INTO visita_codigos (visita_id, codigo, quantidade, desconto_percent_override)
    SELECT
      p_visita_id,
      btrim(c->>'codigo'),
      (c->>'quantidade')::int,
      CASE
        WHEN c ? 'desconto_percent_override'
             AND jsonb_typeof(c->'desconto_percent_override') = 'number'
        THEN (c->>'desconto_percent_override')::numeric
        ELSE NULL
      END
    FROM jsonb_array_elements(p_codigos) AS c;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION replace_visita_codigos(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_visita_codigos(uuid, jsonb) TO authenticated;
