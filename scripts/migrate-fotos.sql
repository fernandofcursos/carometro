-- =============================================================================
-- migrate-fotos.sql — Etapa 1: cria tabela fotos + FK nas tabelas existentes
--                     Etapa 2: migra dados inline → tabela fotos (opcional)
--
-- Uso: psql $DATABASE_URL -f scripts/migrate-fotos.sql
-- Seguro para rodar em produção com dados existentes (idempotente).
-- As colunas inline (foto_dados, foto_iv, etc.) são mantidas nesta etapa.
-- Após verificar que fotoId está preenchido para todos, execute o bloco
-- de DROP no final (comentado) manualmente.
-- =============================================================================

BEGIN;

-- ── Etapa 1: Criar tabela fotos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fotos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo    varchar(20) NOT NULL,
  entidade_id      uuid NOT NULL,
  mime_type        varchar(20) NOT NULL DEFAULT 'image/jpeg',
  tamanho_bytes    integer NOT NULL,
  iv               char(24) NOT NULL,
  hash_integridade char(64) NOT NULL,
  dados            bytea NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fotos_entidade UNIQUE (entidade_tipo, entidade_id)
);

-- ── Adicionar FK foto_id a estudantes ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estudantes' AND column_name = 'foto_id'
  ) THEN
    ALTER TABLE estudantes ADD COLUMN foto_id uuid REFERENCES fotos(id) ON DELETE SET NULL;
    RAISE NOTICE 'estudantes: coluna foto_id adicionada.';
  END IF;
END $$;

-- ── Adicionar FK foto_id a usuarios ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usuarios' AND column_name = 'foto_id'
  ) THEN
    ALTER TABLE usuarios ADD COLUMN foto_id uuid REFERENCES fotos(id) ON DELETE SET NULL;
    RAISE NOTICE 'usuarios: coluna foto_id adicionada.';
  END IF;
END $$;

-- ── Etapa 2: Migrar fotos inline de estudantes → tabela fotos ────────────────
-- Insere na tabela fotos os dados de estudantes que ainda não foram migrados.
-- O iv armazenado é base64 (24 chars), hash é hex (64 chars).
INSERT INTO fotos (entidade_tipo, entidade_id, mime_type, tamanho_bytes, iv, hash_integridade, dados)
SELECT
  'estudante',
  e.id,
  COALESCE(e.foto_mime_type, 'image/jpeg'),
  COALESCE(e.foto_tamanho_bytes, length(e.foto_dados)),
  e.foto_iv,
  e.foto_hash_integridade,
  e.foto_dados
FROM estudantes e
WHERE e.foto_dados IS NOT NULL
  AND e.foto_iv IS NOT NULL
  AND e.foto_hash_integridade IS NOT NULL
  AND e.foto_id IS NULL
ON CONFLICT (entidade_tipo, entidade_id) DO NOTHING;

-- Atualizar FK nos estudantes recém-migrados
UPDATE estudantes e
SET foto_id = f.id
FROM fotos f
WHERE f.entidade_tipo = 'estudante'
  AND f.entidade_id = e.id
  AND e.foto_id IS NULL
  AND e.foto_dados IS NOT NULL;

-- ── Etapa 2: Migrar fotos inline de usuarios → tabela fotos ──────────────────
INSERT INTO fotos (entidade_tipo, entidade_id, mime_type, tamanho_bytes, iv, hash_integridade, dados)
SELECT
  'usuario',
  u.id,
  COALESCE(u.foto_mime_type, 'image/jpeg'),
  COALESCE(u.foto_tamanho_bytes, length(u.foto_dados)),
  u.foto_iv,
  u.foto_hash_integridade,
  u.foto_dados
FROM usuarios u
WHERE u.foto_dados IS NOT NULL
  AND u.foto_iv IS NOT NULL
  AND u.foto_hash_integridade IS NOT NULL
  AND u.foto_id IS NULL
ON CONFLICT (entidade_tipo, entidade_id) DO NOTHING;

-- Atualizar FK nos usuarios recém-migrados
UPDATE usuarios u
SET foto_id = f.id
FROM fotos f
WHERE f.entidade_tipo = 'usuario'
  AND f.entidade_id = u.id
  AND u.foto_id IS NULL
  AND u.foto_dados IS NOT NULL;

DO $$
BEGIN
  RAISE NOTICE 'migrate-fotos: OK';
END $$;

COMMIT;

-- =============================================================================
-- APÓS verificar que TODOS os registros têm foto_id preenchido,
-- execute manualmente para remover colunas inline (libera espaço em disco):
--
-- BEGIN;
-- ALTER TABLE estudantes
--   DROP COLUMN IF EXISTS foto_storage_key,
--   DROP COLUMN IF EXISTS foto_iv,
--   DROP COLUMN IF EXISTS foto_mime_type,
--   DROP COLUMN IF EXISTS foto_tamanho_bytes,
--   DROP COLUMN IF EXISTS foto_hash_integridade,
--   DROP COLUMN IF EXISTS foto_dados;
--
-- ALTER TABLE usuarios
--   DROP COLUMN IF EXISTS foto_storage_key,
--   DROP COLUMN IF EXISTS foto_iv,
--   DROP COLUMN IF EXISTS foto_mime_type,
--   DROP COLUMN IF EXISTS foto_tamanho_bytes,
--   DROP COLUMN IF EXISTS foto_hash_integridade,
--   DROP COLUMN IF EXISTS foto_dados;
-- COMMIT;
-- =============================================================================
