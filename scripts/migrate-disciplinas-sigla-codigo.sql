-- Migration: adiciona sigla e codigo_modulacao à tabela disciplinas
-- Renomeia o conceito de "Disciplinas" para "Unidade Curricular" no banco (schema permanece "disciplinas")
-- Executar: docker compose run --rm dev psql "$DATABASE_URL" -f scripts/migrate-disciplinas-sigla-codigo.sql

-- ─── Função genérica reutilizável ────────────────────────────────────────────
-- Adiciona uma constraint a uma tabela somente se ela ainda não existir.
-- Uso: SELECT add_constraint_if_not_exists('tabela', 'nome_constraint', 'UNIQUE (coluna)');

CREATE OR REPLACE FUNCTION add_constraint_if_not_exists(
  t_name          text,
  c_name          text,
  constraint_sql  text
) RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = c_name
  ) THEN
    EXECUTE 'ALTER TABLE ' || quote_ident(t_name)
         || ' ADD CONSTRAINT ' || quote_ident(c_name)
         || ' ' || constraint_sql;
    RAISE NOTICE 'Constraint % adicionada à tabela %.', c_name, t_name;
  ELSE
    RAISE NOTICE 'Constraint % já existe em % — ignorada.', c_name, t_name;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── Migração ─────────────────────────────────────────────────────────────────

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

END $$;

-- 5. Adicionar constraint UNIQUE na sigla (via função genérica)
SELECT add_constraint_if_not_exists('disciplinas', 'disciplinas_sigla_unique', 'UNIQUE (sigla)');
