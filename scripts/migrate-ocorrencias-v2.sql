-- =============================================================================
-- migrate-ocorrencias-v2.sql — expande ocorrencias + estudantes (idempotente)
--
-- Aplique ANTES de pnpm --filter @workspace/db run push-force
-- Uso: psql $DATABASE_URL -f scripts/migrate-ocorrencias-v2.sql
-- =============================================================================

BEGIN;

-- turno_id em ocorrencias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ocorrencias' AND column_name = 'turno_id') THEN
    ALTER TABLE ocorrencias ADD COLUMN turno_id uuid REFERENCES turnos(id) ON DELETE SET NULL;
    RAISE NOTICE 'ocorrencias: coluna turno_id adicionada.';
  END IF;
END $$;

-- ciente_em em ocorrencias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ocorrencias' AND column_name = 'ciente_em') THEN
    ALTER TABLE ocorrencias ADD COLUMN ciente_em timestamptz;
    RAISE NOTICE 'ocorrencias: coluna ciente_em adicionada.';
  END IF;
END $$;

-- ciente_por_id em ocorrencias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ocorrencias' AND column_name = 'ciente_por_id') THEN
    ALTER TABLE ocorrencias ADD COLUMN ciente_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL;
    RAISE NOTICE 'ocorrencias: coluna ciente_por_id adicionada.';
  END IF;
END $$;

-- notificacao_pais_enviada_em em ocorrencias
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ocorrencias' AND column_name = 'notificacao_pais_enviada_em') THEN
    ALTER TABLE ocorrencias ADD COLUMN notificacao_pais_enviada_em timestamptz;
    RAISE NOTICE 'ocorrencias: coluna notificacao_pais_enviada_em adicionada.';
  END IF;
END $$;

-- observacao: limitar a 300 chars (trunca dados existentes > 300)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ocorrencias' AND column_name = 'observacao' AND data_type = 'text') THEN
    UPDATE ocorrencias SET observacao = LEFT(observacao, 300) WHERE LENGTH(observacao) > 300;
    ALTER TABLE ocorrencias ALTER COLUMN observacao TYPE varchar(300);
    RAISE NOTICE 'ocorrencias: observacao migrada para varchar(300).';
  END IF;
END $$;

-- data_nascimento em estudantes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estudantes' AND column_name = 'data_nascimento') THEN
    ALTER TABLE estudantes ADD COLUMN data_nascimento date;
    RAISE NOTICE 'estudantes: coluna data_nascimento adicionada.';
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'migrate-ocorrencias-v2: OK'; END $$;
COMMIT;
