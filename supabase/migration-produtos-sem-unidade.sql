-- Remove coluna unidade do catálogo de produtos (não usada mais no app/PDF).
ALTER TABLE produtos DROP COLUMN IF EXISTS unidade;
