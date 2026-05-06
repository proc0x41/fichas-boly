-- Adiciona timestamp de envio do pedido/orçamento para a Representada (via WhatsApp).
-- Quando preenchido, indica que o pedido já foi enviado e exibe badge na tela de Pedidos.
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS enviado_representada_em timestamptz;
