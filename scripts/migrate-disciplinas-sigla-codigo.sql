-- Migration: adiciona sigla e codigo_modulacao à tabela disciplinas
-- Renomeia o conceito de "Disciplinas" para "Unidade Curricular" no banco (schema permanece "disciplinas")
-- Executar: psql $DATABASE_URL -f scripts/migrate-disciplinas-sigla-codigo.sql

BEGIN;

-- 1. Adicionar colunas com DEFAULT temporário para registros existentes
ALTER TABLE disciplinas
  ADD COLUMN IF NOT EXISTS sigla           varchar(20),
  ADD COLUMN IF NOT EXISTS codigo_modulacao varchar(50);

-- 2. Preencher valores temporários nos registros existentes
--    Sigla: primeiras letras de cada palavra do nome (ex: "Matemática" → "MAT")
--    Código: usa o próprio id truncado como placeholder
UPDATE disciplinas
SET
  sigla           = COALESCE(sigla,           upper(substring(nome, 1, 6))),
  codigo_modulacao = COALESCE(codigo_modulacao, upper(substring(nome, 1, 10)))
WHERE sigla IS NULL OR codigo_modulacao IS NULL;

-- 3. Tornar obrigatórias (NOT NULL) após preencher os existentes
ALTER TABLE disciplinas
  ALTER COLUMN sigla           SET NOT NULL,
  ALTER COLUMN codigo_modulacao SET NOT NULL;

-- 4. Criar índice UNIQUE na sigla (equivale a UNIQUE constraint, suportado em todas as versões)
CREATE UNIQUE INDEX IF NOT EXISTS disciplinas_sigla_unique ON disciplinas (sigla);

-- 5. Criar índice de busca rápida por sigla (já coberto pelo UNIQUE acima, mas explícito)
CREATE INDEX IF NOT EXISTS idx_disciplinas_sigla ON disciplinas (lower(sigla));

COMMIT;
