-- Migration: publico_alvo de varchar → text[]
-- Execute: psql "$DATABASE_URL" -f scripts/migrate-avisos-publico-alvo-array.sql

DO $$
BEGIN
  -- Só executa se a coluna ainda for varchar (idempotente)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'avisos'
      AND column_name = 'publico_alvo'
      AND data_type = 'character varying'
  ) THEN
    -- Remove o default antes de converter (PostgreSQL não faz cast automático do default)
    ALTER TABLE avisos ALTER COLUMN publico_alvo DROP DEFAULT;

    ALTER TABLE avisos
      ALTER COLUMN publico_alvo TYPE text[]
      USING ARRAY[publico_alvo];

    ALTER TABLE avisos
      ALTER COLUMN publico_alvo SET DEFAULT ARRAY['todos']::text[];

    RAISE NOTICE 'avisos.publico_alvo convertido para text[].';
  ELSE
    RAISE NOTICE 'avisos.publico_alvo já é text[] — ignorado.';
  END IF;
END $$;
