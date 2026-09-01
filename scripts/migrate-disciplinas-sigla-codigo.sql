-- Migration: adiciona sigla e codigo_modulacao à tabela disciplinas
-- Renomeia o conceito de "Disciplinas" para "Unidade Curricular" no banco (schema permanece "disciplinas")
-- Executar: docker compose run --rm dev psql "$DATABASE_URL" -f scripts/migrate-disciplinas-sigla-codigo.sql

DO $$
BEGIN

  -- 1. Adicionar coluna sigla (se não existir)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'disciplinas' AND column_name = 'sigla'
  ) THEN
    ALTER TABLE disciplinas ADD COLUMN sigla varchar(20);
    RAISE NOTICE 'disciplinas: coluna sigla adicionada.';
  END IF;

  -- 2. Adicionar coluna codigo_modulacao (se não existir)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'disciplinas' AND column_name = 'codigo_modulacao'
  ) THEN
    ALTER TABLE disciplinas ADD COLUMN codigo_modulacao varchar(50);
    RAISE NOTICE 'disciplinas: coluna codigo_modulacao adicionada.';
  END IF;

  -- 3. Preencher valores temporários nos registros existentes
  UPDATE disciplinas
  SET
    sigla           = COALESCE(sigla,           upper(substring(nome, 1, 6))),
    codigo_modulacao = COALESCE(codigo_modulacao, upper(substring(nome, 1, 10)))
  WHERE sigla IS NULL OR codigo_modulacao IS NULL;
  RAISE NOTICE 'disciplinas: valores temporários preenchidos.';

  -- 4. Tornar obrigatórias (NOT NULL)
  ALTER TABLE disciplinas ALTER COLUMN sigla           SET NOT NULL;
  ALTER TABLE disciplinas ALTER COLUMN codigo_modulacao SET NOT NULL;
  RAISE NOTICE 'disciplinas: colunas sigla e codigo_modulacao definidas como NOT NULL.';

  -- 5. Criar índice UNIQUE na sigla (se não existir)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'disciplinas' AND indexname = 'disciplinas_sigla_unique'
  ) THEN
    CREATE UNIQUE INDEX disciplinas_sigla_unique ON disciplinas (sigla);
    RAISE NOTICE 'disciplinas: índice UNIQUE disciplinas_sigla_unique criado.';
  END IF;

  -- 6. Criar índice de busca por sigla em lowercase (se não existir)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'disciplinas' AND indexname = 'idx_disciplinas_sigla'
  ) THEN
    CREATE INDEX idx_disciplinas_sigla ON disciplinas (lower(sigla));
    RAISE NOTICE 'disciplinas: índice idx_disciplinas_sigla criado.';
  END IF;

END $$;
