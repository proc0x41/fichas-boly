-- ============================================================
-- Migração: quantidade obrigatória em visita_codigos
-- Execute no Supabase SQL Editor.
-- Idempotente.
-- ============================================================

-- Adiciona coluna com DEFAULT 1 para registros existentes
ALTER TABLE visita_codigos
  ADD COLUMN IF NOT EXISTS quantidade int;

-- Preenche linhas antigas com 1 (caso tenham NULL)
UPDATE visita_codigos SET quantidade = 1 WHERE quantidade IS NULL;

-- Agora exige NOT NULL e > 0
ALTER TABLE visita_codigos
  ALTER COLUMN quantidade SET NOT NULL,
  ALTER COLUMN quantidade SET DEFAULT 1;

-- Check constraint (usa DO block para idempotência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'visita_codigos_quantidade_check'
  ) THEN
    ALTER TABLE visita_codigos
      ADD CONSTRAINT visita_codigos_quantidade_check
      CHECK (quantidade > 0 AND quantidade <= 99999);
  END IF;
END $$;
