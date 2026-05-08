-- ============================================================
-- Desconto por item (override do desconto global do pedido).
--
-- Cada visita_codigos pode opcionalmente ter um % de desconto que
-- substitui o desconto_percent global da visita só para essa linha.
-- NULL = herda o global; valor 0–100 = override (0 = sem desconto).
-- ============================================================

ALTER TABLE visita_codigos
  ADD COLUMN IF NOT EXISTS desconto_percent_override numeric(5, 2)
  CHECK (
    desconto_percent_override IS NULL
    OR (desconto_percent_override >= 0 AND desconto_percent_override <= 100)
  );

COMMENT ON COLUMN visita_codigos.desconto_percent_override IS
  'Desconto % específico desta linha. NULL = usa visitas.desconto_percent (global). 0 = item sem desconto mesmo havendo desconto global.';

-- Atualiza o RPC para aceitar `desconto_percent_override` no JSON de entrada.
-- Campo opcional — quando ausente ou null, persiste como NULL (herda global).
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
