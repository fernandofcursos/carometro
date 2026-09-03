-- =============================================================================
-- migrate-turma-turnos.sql
--
-- Migra os vínculos turma↔turno da coluna turmas.turno_id para a nova tabela
-- turma_turnos (relação N:N), sem perda de dados.
--
-- Execute ANTES de: pnpm --filter @workspace/db run push-force
--
-- Uso:
--   psql $DATABASE_URL -f scripts/migrate-turma-turnos.sql
-- =============================================================================

BEGIN;

-- 1. Criar tabela de junção se ainda não existir
CREATE TABLE IF NOT EXISTS turma_turnos (
  turma_id  uuid        NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  turno_id  uuid        NOT NULL REFERENCES turnos(id) ON DELETE RESTRICT,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_turma_turno UNIQUE (turma_id, turno_id)
);

-- 2. Migrar vínculos existentes de turmas.turno_id → turma_turnos
INSERT INTO turma_turnos (turma_id, turno_id)
SELECT id, turno_id
FROM   turmas
WHERE  turno_id  IS NOT NULL
  AND  deletado_em IS NULL
ON CONFLICT DO NOTHING;

-- 3. Relatório: exibe o que foi migrado para confirmação visual
SELECT
  t.sigla        AS turma_sigla,
  t.descricao    AS turma_descricao,
  tn.nome        AS turno,
  tt.criado_em   AS migrado_em
FROM  turma_turnos tt
JOIN  turmas t  ON t.id  = tt.turma_id
JOIN  turnos tn ON tn.id = tt.turno_id
ORDER BY t.sigla, tn.nome;

COMMIT;
