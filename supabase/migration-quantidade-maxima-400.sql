-- Altera limite de quantidade para 400 (ou mais)
ALTER TABLE visita_codigos DROP CONSTRAINT IF EXISTS visita_codigos_quantidade_check;
ALTER TABLE visita_codigos ADD CONSTRAINT visita_codigos_quantidade_check CHECK (quantidade > 0 AND quantidade <= 9999);