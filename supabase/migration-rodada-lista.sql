-- Checklist por rodada: só considera execuções finalizadas depois de lista_rodada_desde.
-- Botão "Nova rodada" no app atualiza este campo (sem apagar histórico).
-- Idempotente.

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS lista_rodada_desde timestamptz;

COMMENT ON COLUMN perfis.lista_rodada_desde IS 'Início da rodada atual da checklist; finalizações anteriores não contam para "feita". NULL = usa apenas o ciclo em dias.';
