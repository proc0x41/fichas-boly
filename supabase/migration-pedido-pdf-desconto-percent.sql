-- Troca desconto em R$ (desconto_total) por desconto em % (desconto_percent).
-- Execute após migration-pedido-pdf-catalogo.sql. Idempotente.

ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS desconto_percent numeric(5, 2) NOT NULL DEFAULT 0
  CHECK (desconto_percent >= 0 AND desconto_percent <= 100);

ALTER TABLE visitas DROP COLUMN IF EXISTS desconto_total;

COMMENT ON COLUMN visitas.desconto_percent IS 'Desconto único do pedido em % sobre o preço de tabela (por linha).';
