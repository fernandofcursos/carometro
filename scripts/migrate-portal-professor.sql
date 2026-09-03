-- Migration: cria tabela avisos para o Portal do Professor
-- Executar: docker compose run --rm dev psql "$DATABASE_URL" -f scripts/migrate-portal-professor.sql

-- Função genérica reutilizável (idempotente)
CREATE OR REPLACE FUNCTION add_constraint_if_not_exists(
  t_name         text,
  c_name         text,
  constraint_sql text
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

DO $$
BEGIN

  -- Criar tabela avisos (se não existir)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'avisos'
  ) THEN
    CREATE TABLE avisos (
      id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo        varchar(200) NOT NULL,
      conteudo      text         NOT NULL,
      tipo          varchar(20)  NOT NULL DEFAULT 'aviso'
                                 CHECK (tipo IN ('aviso', 'informe')),
      publico_alvo  varchar(30)  NOT NULL DEFAULT 'todos'
                                 CHECK (publico_alvo IN ('estudantes', 'responsaveis', 'todos')),
      turma_id      uuid         REFERENCES turmas(id) ON DELETE SET NULL,
      autor_id      uuid         REFERENCES usuarios(id) ON DELETE SET NULL,
      publicado     boolean      NOT NULL DEFAULT false,
      criado_em     timestamptz  NOT NULL DEFAULT now(),
      atualizado_em timestamptz  NOT NULL DEFAULT now(),
      deletado_em   timestamptz
    );
    RAISE NOTICE 'Tabela avisos criada.';
  ELSE
    RAISE NOTICE 'Tabela avisos já existe — ignorada.';
  END IF;

END $$;

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_avisos_autor     ON avisos (autor_id)  WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_turma     ON avisos (turma_id)  WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_publicado ON avisos (publicado)  WHERE deletado_em IS NULL;
