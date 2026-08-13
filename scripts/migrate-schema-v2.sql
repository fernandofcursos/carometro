-- =============================================================================
-- migrate-schema-v2.sql
--
-- Aplica as mudanças de schema sem perda de dados:
--   1. cursos    → adiciona coluna sigla (varchar 4, NOT NULL, UNIQUE)
--   2. turmas    → adiciona colunas ano e semestre (nullable)
--   3. turma_turnos → cria tabela e migra turno_id existente
--
-- Execute ANTES de: pnpm --filter @workspace/db run push-force
--
-- Uso:
--   psql $DATABASE_URL -f scripts/migrate-schema-v2.sql
-- =============================================================================

BEGIN;

-- ============================================================
-- PASSO 1: cursos — coluna sigla
-- ============================================================

ALTER TABLE cursos ADD COLUMN IF NOT EXISTS sigla varchar(4);

-- Preenche sigla com as primeiras 4 letras do nome (maiúsculas, sem espaços)
UPDATE cursos
SET    sigla = upper(left(regexp_replace(nome, '[^A-Za-z]', '', 'g'), 4))
WHERE  sigla IS NULL;

-- Desambigua duplicatas adicionando sufixo numérico (ex: INFO → INF2)
WITH duplicatas AS (
  SELECT id,
         sigla,
         row_number() OVER (PARTITION BY sigla ORDER BY criado_em) AS rn
  FROM   cursos
)
UPDATE cursos c
SET    sigla = left(d.sigla, 3) || d.rn::text
FROM   duplicatas d
WHERE  c.id = d.id
  AND  d.rn > 1;

ALTER TABLE cursos ALTER COLUMN sigla SET NOT NULL;
ALTER TABLE cursos DROP   CONSTRAINT IF EXISTS cursos_sigla_key;
ALTER TABLE cursos ADD    CONSTRAINT cursos_sigla_key UNIQUE (sigla);

-- ============================================================
-- PASSO 2: turmas — colunas ano e semestre
-- ============================================================

ALTER TABLE turmas ADD COLUMN IF NOT EXISTS ano      integer;
ALTER TABLE turmas ADD COLUMN IF NOT EXISTS semestre smallint;

-- ============================================================
-- PASSO 3: turma_turnos — criar tabela e migrar dados
-- ============================================================

CREATE TABLE IF NOT EXISTS turma_turnos (
  turma_id  uuid        NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  turno_id  uuid        NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_turma_turno UNIQUE (turma_id, turno_id)
);

-- Migrar vínculos existentes de turmas.turno_id → turma_turnos
INSERT INTO turma_turnos (turma_id, turno_id)
SELECT id, turno_id
FROM   turmas
WHERE  turno_id   IS NOT NULL
  AND  deletado_em IS NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

SELECT '--- CURSOS ---' AS resultado, '' AS detalhe
UNION ALL
SELECT sigla, nome FROM cursos ORDER BY sigla
UNION ALL
SELECT '--- TURMAS COM ANO/SEMESTRE ---', ''
UNION ALL
SELECT sigla, coalesce(ano::text, 'sem ano') || ' / sem ' || coalesce(semestre::text, '?')
FROM   turmas WHERE deletado_em IS NULL ORDER BY sigla
UNION ALL
SELECT '--- VÍNCULOS MIGRADOS (turma_turnos) ---', ''
UNION ALL
SELECT t.sigla, tn.nome
FROM   turma_turnos tt
JOIN   turmas t  ON t.id  = tt.turma_id
JOIN   turnos tn ON tn.id = tt.turno_id
ORDER  BY t.sigla, tn.nome;

COMMIT;
