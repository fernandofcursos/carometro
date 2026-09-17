-- migrate-matriculas-turno.sql
-- Adiciona coluna turno_id à tabela matriculas para registrar o turno específico do estudante.
-- Idempotente: seguro executar múltiplas vezes.
-- Executar: psql $DATABASE_URL -f scripts/migrate-matriculas-turno.sql

BEGIN;

ALTER TABLE matriculas
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_matriculas_turno ON matriculas(turno_id);

COMMIT;

SELECT 'migrate-matriculas-turno.sql concluído com sucesso.' AS status;
