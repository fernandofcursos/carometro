-- =============================================================================
-- migrate-matriculas.sql — cria/migra tabela matriculas (idempotente)
--
-- Aplique ANTES de pnpm --filter @workspace/db run push-force
-- Uso: psql $DATABASE_URL -f scripts/migrate-matriculas.sql
-- =============================================================================

BEGIN;

-- Cria tabela se não existir (nova instalação)
-- Já usa o índice parcial correto para instalações novas
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
  CONSTRAINT ck_semestre CHECK (semestre IN (1, 2))
);

-- ── Migração: remover coluna 'principal' se existir (schema antigo) ───────────
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

-- ── Migração: substituir constraint antiga (4 colunas → 3 colunas) ────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'matriculas' AND constraint_name = 'uq_matricula'
  ) THEN
    ALTER TABLE matriculas DROP CONSTRAINT uq_matricula;
    RAISE NOTICE 'matriculas: constraint uq_matricula (antiga, 4 colunas) removida.';
  END IF;
END $$;

-- ── Migração CRÍTICA: trocar constraint não-parcial pelo índice parcial ────────
--
-- Motivo: UNIQUE (usuario_id, ano, semestre) sem WHERE inclui linhas
-- soft-deleted (deletado_em IS NOT NULL). Ao reenturmar um estudante após
-- remoção de matrícula, o PostgreSQL disparava 23505 mesmo a linha sendo
-- "deletada" logicamente — causando "estudante já enturmado" fantasma.
--
-- Solução: índice parcial UNIQUE WHERE deletado_em IS NULL — linhas
-- soft-deleted saem da unicidade e não bloqueiam reenturmação.

DO $$
BEGIN
  -- Remove constraint não-parcial (criada pelo script antigo ou pelo Drizzle push)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'matriculas' AND constraint_name = 'uq_matricula_semestre'
  ) THEN
    ALTER TABLE matriculas DROP CONSTRAINT uq_matricula_semestre;
    RAISE NOTICE 'matriculas: constraint uq_matricula_semestre (não-parcial) removida.';
  END IF;

  -- Remove índice não-parcial se existir como index (não como constraint)
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matriculas' AND indexname = 'uq_matricula_semestre'
  ) THEN
    DROP INDEX uq_matricula_semestre;
    RAISE NOTICE 'matriculas: index uq_matricula_semestre (não-parcial) removido.';
  END IF;

  -- Cria índice parcial: só linhas ativas participam da unicidade
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matriculas' AND indexname = 'uq_matricula_ativo'
  ) THEN
    CREATE UNIQUE INDEX uq_matricula_ativo
      ON matriculas (usuario_id, ano, semestre)
      WHERE deletado_em IS NULL;
    RAISE NOTICE 'matriculas: índice parcial uq_matricula_ativo criado.';
  END IF;
END $$;

-- ── Migração: substituir uq_matricula_ativo (ano/semestre) por uq_matricula_usuario_turma ──
--
-- Nova regra: estudante pode estar em 2 turmas do mesmo curso em turnos diferentes.
-- O índice parcial passa a garantir unicidade por (usuarioId, turmaId), não por
-- (usuarioId, ano, semestre). A restrição de "mesmo turno" é verificada em app-level.

DO $$
BEGIN
  -- Remove índice parcial antigo (ano, semestre)
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matriculas' AND indexname = 'uq_matricula_ativo'
  ) THEN
    DROP INDEX uq_matricula_ativo;
    RAISE NOTICE 'matriculas: índice uq_matricula_ativo (ano/semestre) removido.';
  END IF;

  -- Cria índice parcial novo (usuarioId, turmaId)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'matriculas' AND indexname = 'uq_matricula_usuario_turma'
  ) THEN
    CREATE UNIQUE INDEX uq_matricula_usuario_turma
      ON matriculas (usuario_id, turma_id)
      WHERE deletado_em IS NULL;
    RAISE NOTICE 'matriculas: índice uq_matricula_usuario_turma criado.';
  END IF;
END $$;

-- ── Migração: adicionar coluna modulo_menor em cursos ─────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cursos' AND column_name = 'modulo_menor'
  ) THEN
    ALTER TABLE cursos ADD COLUMN modulo_menor BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'cursos: coluna modulo_menor adicionada.';
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Tabela matriculas: OK';
END $$;

COMMIT;
