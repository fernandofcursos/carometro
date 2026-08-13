-- =============================================================================
-- migrate-matriculas.sql — cria tabela matriculas (idempotente)
--
-- Aplique ANTES de pnpm --filter @workspace/db run push-force
-- Uso: psql $DATABASE_URL -f scripts/migrate-matriculas.sql
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS matriculas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  turma_id      uuid        NOT NULL REFERENCES turmas(id)   ON DELETE RESTRICT,
  registro      varchar(20) NOT NULL,
  ano           integer     NOT NULL,
  semestre      smallint    NOT NULL,
  principal     boolean     NOT NULL DEFAULT true,
  ativo         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em   timestamptz,
  CONSTRAINT uq_matricula UNIQUE (usuario_id, turma_id, ano, semestre),
  CONSTRAINT ck_semestre  CHECK  (semestre IN (1, 2))
);

DO $$
BEGIN
  RAISE NOTICE 'Tabela matriculas: OK';
END $$;

COMMIT;
