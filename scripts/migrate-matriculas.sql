-- =============================================================================
-- migrate-matriculas.sql — cria/migra tabela matriculas (idempotente)
--
-- Aplique ANTES de pnpm --filter @workspace/db run push-force
-- Uso: psql $DATABASE_URL -f scripts/migrate-matriculas.sql
-- =============================================================================

BEGIN;

-- Cria tabela se não existir (nova instalação)
CREATE TABLE IF NOT EXISTS matriculas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  turma_id      uuid        NOT NULL REFERENCES turmas(id)   ON DELETE RESTRICT,
  registro      varchar(20) NOT NULL,
  ano           integer     NOT NULL,
  semestre      smallint    NOT NULL,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em   timestamptz,
  CONSTRAINT uq_matricula_semestre UNIQUE (usuario_id, ano, semestre),
  CONSTRAINT ck_semestre           CHECK  (semestre IN (1, 2))
);

-- Migração: remover coluna 'principal' se existir (schema antigo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'matriculas' AND column_name = 'principal'
  ) THEN
    ALTER TABLE matriculas DROP COLUMN principal;
    RAISE NOTICE 'matriculas: coluna principal removida.';
  END IF;
END $$;

-- Migração: substituir constraint antiga (4 colunas) pela nova (3 colunas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'matriculas' AND constraint_name = 'uq_matricula'
  ) THEN
    ALTER TABLE matriculas DROP CONSTRAINT uq_matricula;
    RAISE NOTICE 'matriculas: constraint uq_matricula removida.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'matriculas' AND constraint_name = 'uq_matricula_semestre'
  ) THEN
    ALTER TABLE matriculas ADD CONSTRAINT uq_matricula_semestre UNIQUE (usuario_id, ano, semestre);
    RAISE NOTICE 'matriculas: constraint uq_matricula_semestre criada.';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Tabela matriculas: OK';
END $$;

COMMIT;
