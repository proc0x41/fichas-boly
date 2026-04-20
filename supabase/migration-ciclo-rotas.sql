-- ============================================================
-- Migração: ciclo de rotas (todo list) - duração em dias por vendedor
-- Execute no Supabase SQL Editor.
-- Idempotente.
-- ============================================================

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS ciclo_dias int NOT NULL DEFAULT 7;

-- Garante um range sensato (1 a 60 dias)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'perfis_ciclo_dias_check'
  ) THEN
    ALTER TABLE perfis
      ADD CONSTRAINT perfis_ciclo_dias_check
      CHECK (ciclo_dias BETWEEN 1 AND 60);
  END IF;
END $$;
