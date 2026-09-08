-- =============================================================================
-- migrate-estudantes-v2.sql — adiciona usuario_id em estudantes (idempotente)
--
-- Aplique ANTES de pnpm --filter @workspace/db run push-force
-- Uso: psql $DATABASE_URL -f scripts/migrate-estudantes-v2.sql
-- =============================================================================

BEGIN;

-- usuario_id: vincula um registro em estudantes ao usuario correspondente
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estudantes' AND column_name = 'usuario_id'
  ) THEN
    ALTER TABLE estudantes ADD COLUMN usuario_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
    -- Unicidade parcial: cada usuario só pode ter um registro em estudantes
    CREATE UNIQUE INDEX uq_estudantes_usuario_id
      ON estudantes(usuario_id)
      WHERE usuario_id IS NOT NULL;
    RAISE NOTICE 'estudantes: coluna usuario_id adicionada.';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'migrate-estudantes-v2: OK'; END $$;
COMMIT;
