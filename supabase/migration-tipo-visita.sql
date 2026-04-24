-- Adiciona tipo de documento na visita: pedido (padrão) ou orçamento.
-- O tipo aparece no cabeçalho do PDF e permite filtrar no histórico do cliente.

ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS tipo_visita TEXT NOT NULL DEFAULT 'pedido'
    CHECK (tipo_visita IN ('pedido', 'orcamento'));
