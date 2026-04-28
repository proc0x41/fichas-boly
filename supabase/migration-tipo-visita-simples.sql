-- Permite registrar uma parada apenas como "visitada", sem gerar pedido/orçamento
-- (útil em rotas onde o cliente não comprou no momento).
--
-- - Adiciona o tipo 'visita' ao CHECK de tipo_visita.
-- - Torna numero_pedido NULL-able (visitas simples não consomem a sequência).
-- - Atualiza o trigger para não atribuir número quando tipo_visita = 'visita'.

ALTER TABLE visitas
  DROP CONSTRAINT IF EXISTS visitas_tipo_visita_check;

ALTER TABLE visitas
  ADD CONSTRAINT visitas_tipo_visita_check
    CHECK (tipo_visita IN ('pedido', 'orcamento', 'visita'));

ALTER TABLE visitas
  ALTER COLUMN numero_pedido DROP NOT NULL;

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
