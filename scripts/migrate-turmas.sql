-- =============================================================================
-- migrate-turmas.sql — adiciona campo modulo à tabela turmas (idempotente)
--
-- Uso: psql $DATABASE_URL -f scripts/migrate-turmas.sql
-- =============================================================================

BEGIN;

-- ── Adicionar coluna modulo se não existir ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'turmas' AND column_name = 'modulo'
  ) THEN
    ALTER TABLE turmas ADD COLUMN modulo varchar(4);
    RAISE NOTICE 'turmas: coluna modulo adicionada.';
  END IF;
END $$;

-- ── Adicionar constraint de check se não existir ──────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'turmas' AND constraint_name = 'ck_turma_modulo'
  ) THEN
    ALTER TABLE turmas
      ADD CONSTRAINT ck_turma_modulo
      CHECK (modulo IN ('I','II','III','IV','V','VI'));
    RAISE NOTICE 'turmas: constraint ck_turma_modulo adicionada.';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Tabela turmas: OK';
END $$;

COMMIT;
