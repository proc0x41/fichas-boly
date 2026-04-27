-- Adiciona coluna complemento à tabela clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS complemento text CHECK (char_length(complemento) <= 100);