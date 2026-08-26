-- migrate-pending.sql — aplica colunas adicionadas ao schema desde o deploy inicial
-- Idempotente: seguro executar múltiplas vezes
-- Executar: psql $DATABASE_URL -f scripts/migrate-pending.sql

BEGIN;

-- ── cursos: coluna modulo_menor ───────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cursos' AND column_name = 'modulo_menor'
  ) THEN
    ALTER TABLE cursos ADD COLUMN modulo_menor BOOLEAN NOT NULL DEFAULT FALSE;
    RAISE NOTICE 'cursos: coluna modulo_menor adicionada.';
  ELSE
    RAISE NOTICE 'cursos: coluna modulo_menor já existe — OK.';
  END IF;
END $$;

-- ── turmas: coluna modulo e constraint ck_turma_modulo ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'turmas' AND column_name = 'modulo'
  ) THEN
    ALTER TABLE turmas ADD COLUMN modulo varchar(4);
    RAISE NOTICE 'turmas: coluna modulo adicionada.';
  ELSE
    RAISE NOTICE 'turmas: coluna modulo já existe — OK.';
  END IF;
END $$;

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
  ELSE
    RAISE NOTICE 'turmas: constraint ck_turma_modulo já existe — OK.';
  END IF;
END $$;

-- ── estudantes: coluna data_nascimento ───────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estudantes' AND column_name = 'data_nascimento'
  ) THEN
    ALTER TABLE estudantes ADD COLUMN data_nascimento DATE;
    RAISE NOTICE 'estudantes: coluna data_nascimento adicionada.';
  ELSE
    RAISE NOTICE 'estudantes: coluna data_nascimento já existe — OK.';
  END IF;
END $$;

-- ── usuarios: coluna data_nascimento ─────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'data_nascimento'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN data_nascimento DATE;
    RAISE NOTICE 'usuarios: coluna data_nascimento adicionada.';
  ELSE
    RAISE NOTICE 'usuarios: coluna data_nascimento já existe — OK.';
  END IF;
END $$;

-- ── fotos: tabela e FKs em estudantes e usuarios ─────────────────────────────
CREATE TABLE IF NOT EXISTS fotos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo   varchar(20) NOT NULL,
  entidade_id     uuid NOT NULL,
  mime_type       varchar(20) NOT NULL DEFAULT 'image/jpeg',
  tamanho_bytes   integer NOT NULL,
  iv              char(24) NOT NULL,
  hash_integridade char(64) NOT NULL,
  dados           bytea NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fotos_entidade UNIQUE (entidade_tipo, entidade_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estudantes' AND column_name = 'foto_id'
  ) THEN
    ALTER TABLE estudantes ADD COLUMN foto_id uuid REFERENCES fotos(id) ON DELETE SET NULL;
    RAISE NOTICE 'estudantes: coluna foto_id adicionada.';
  ELSE
    RAISE NOTICE 'estudantes: coluna foto_id já existe — OK.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'foto_id'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN foto_id uuid REFERENCES fotos(id) ON DELETE SET NULL;
    RAISE NOTICE 'usuarios: coluna foto_id adicionada.';
  ELSE
    RAISE NOTICE 'usuarios: coluna foto_id já existe — OK.';
  END IF;
END $$;

COMMIT;

SELECT 'migrate-pending.sql concluído com sucesso.' AS status;
