-- ============================================================
-- Migração: rotas como templates reutilizáveis + execuções
-- Execute no Supabase SQL Editor após o schema.sql original.
-- Idempotente: usa IF NOT EXISTS e DROP IF EXISTS onde seguro.
-- ============================================================

-- 1) ROTAS (agora templates reutilizáveis)
-- Adiciona ordem e ativo; mantém data_rota como legado (opcional).
ALTER TABLE rotas
  ADD COLUMN IF NOT EXISTS ordem int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Torna data_rota opcional (rotas-template não precisam de data fixa)
ALTER TABLE rotas ALTER COLUMN data_rota DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rotas_ordem ON rotas(vendedor_id, ordem);

-- 2) ROTA_EXECUCOES: cada vez que o vendedor "inicia" uma rota
CREATE TABLE IF NOT EXISTS rota_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid REFERENCES rotas ON DELETE CASCADE NOT NULL,
  vendedor_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  finalizada_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rota_execucoes_rota ON rota_execucoes(rota_id);
CREATE INDEX IF NOT EXISTS idx_rota_execucoes_vendedor_ativa
  ON rota_execucoes(vendedor_id)
  WHERE finalizada_em IS NULL;

ALTER TABLE rota_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendedor_select_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_select_execucoes" ON rota_execucoes FOR SELECT
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_insert_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_insert_execucoes" ON rota_execucoes FOR INSERT
  TO authenticated
  WITH CHECK (
    vendedor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM rotas
      WHERE rotas.id = rota_id
      AND rotas.vendedor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vendedor_update_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_update_execucoes" ON rota_execucoes FOR UPDATE
  TO authenticated
  USING (vendedor_id = auth.uid())
  WITH CHECK (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "vendedor_delete_execucoes" ON rota_execucoes;
CREATE POLICY "vendedor_delete_execucoes" ON rota_execucoes FOR DELETE
  TO authenticated
  USING (vendedor_id = auth.uid());

DROP POLICY IF EXISTS "admin_all_execucoes" ON rota_execucoes;
CREATE POLICY "admin_all_execucoes" ON rota_execucoes FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 3) VISITAS: vincular visita a uma execução (para calcular progresso)
--    e campos do pedido (condições de pagamento).
ALTER TABLE visitas
  ADD COLUMN IF NOT EXISTS rota_execucao_id uuid REFERENCES rota_execucoes ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condicoes_pagamento text CHECK (char_length(condicoes_pagamento) <= 500);

CREATE INDEX IF NOT EXISTS idx_visitas_execucao ON visitas(rota_execucao_id);

-- 4) ROTA_CLIENTES: visita_id deixa de ser usado (fica como legado).
--    Progresso da execução é calculado via visitas.rota_execucao_id.
--    Mantemos a coluna para compatibilidade; não é mais necessária.

-- ============================================================
-- OBSERVAÇÕES:
-- - Para adicionar detalhes do pedido (Condições de Pagamento e
--   Observações), o vendedor preenche os campos no formulário da
--   visita. No Supabase, são gravados em:
--     visitas.condicoes_pagamento  (texto)
--     visitas.observacao           (texto)
-- - O botão "Enviar para Mercos" gera um link wa.me para
--   +551140401847 com o pedido pré-formatado.
-- ============================================================
