-- =============================================================================
-- migrate-carteiras-revogar.sql — Adiciona colunas revogado_em / revogado_por_id
--
-- Uso: psql $DATABASE_URL -f scripts/migrate-carteiras-revogar.sql
-- Idempotente (IF NOT EXISTS).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'carteiras' AND column_name = 'revogado_em'
  ) THEN
    ALTER TABLE carteiras
      ADD COLUMN revogado_em    timestamptz,
      ADD COLUMN revogado_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
    RAISE NOTICE 'carteiras: colunas revogado_em e revogado_por_id adicionadas.';
  END IF;
END $$;

COMMIT;
