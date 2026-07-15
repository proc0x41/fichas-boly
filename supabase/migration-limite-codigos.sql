-- ============================================================
-- Migração: aumenta o limite de códigos por visita de 200 para 1000
-- Motivo: clientes registram orçamentos/pedidos com mais de 200 itens.
-- A UI (ChipInput) já suporta até 400 itens e o PDF pagina com
-- showHead: 'everyPage', então não há risco de estourar página.
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER.
-- Execute no Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION check_max_codigos_per_visita()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM visita_codigos WHERE visita_id = NEW.visita_id) >= 1000 THEN
    RAISE EXCEPTION 'Limite de 1000 códigos por visita atingido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_max_codigos ON visita_codigos;
CREATE TRIGGER trg_max_codigos
  BEFORE INSERT ON visita_codigos
  FOR EACH ROW
  EXECUTE FUNCTION check_max_codigos_per_visita();
