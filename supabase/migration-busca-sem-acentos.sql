-- Migração: busca de clientes sem acentuação
-- Adiciona coluna gerada `search_text` em `clientes` com texto normalizado
-- (lowercase + sem acentos) concatenando os campos textuais usados na busca.
-- Permite que o app procure "sao paulo" e encontre "São Paulo".

-- 1. Extensão unaccent (idempotente)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Wrapper IMMUTABLE para poder usar em colunas geradas / índices.
--    A função unaccent padrão não é IMMUTABLE, então criamos um wrapper.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

-- 3. Coluna gerada com texto normalizado para busca.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    lower(public.f_unaccent(
      coalesce(fantasia, '') || ' ' ||
      coalesce(razao_social, '') || ' ' ||
      coalesce(comprador, '') || ' ' ||
      coalesce(endereco, '') || ' ' ||
      coalesce(bairro, '') || ' ' ||
      coalesce(cidade, '') || ' ' ||
      coalesce(estado, '') || ' ' ||
      coalesce(email, '')
    ))
  ) STORED;

-- 4. Índice para acelerar buscas com ilike (%termo%) na coluna normalizada.
--    Usa pg_trgm se disponível para melhor performance em LIKE/ILIKE.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_clientes_search_text_trgm
  ON public.clientes USING gin (search_text gin_trgm_ops);
