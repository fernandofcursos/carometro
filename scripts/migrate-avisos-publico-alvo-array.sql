-- Migration: Público-alvo múltiplo para Avisos e Informes (2FN)
-- Cria tabela de junção avisos_publicos_alvo em vez de atributo multi-valorado.
-- Execute: psql "$DATABASE_URL" -f scripts/migrate-avisos-publico-alvo-array.sql

DO $$
BEGIN
  -- 1. Criar tabela de junção
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'avisos_publicos_alvo'
  ) THEN
    CREATE TABLE avisos_publicos_alvo (
      aviso_id  uuid        NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
      perfil    varchar(30) NOT NULL,
      PRIMARY KEY (aviso_id, perfil)
    );
    RAISE NOTICE 'Tabela avisos_publicos_alvo criada.';
  ELSE
    RAISE NOTICE 'Tabela avisos_publicos_alvo já existe — ignorada.';
  END IF;

  -- 2. Migrar dados existentes da coluna publico_alvo (varchar) para a nova tabela
  INSERT INTO avisos_publicos_alvo (aviso_id, perfil)
  SELECT id, publico_alvo
  FROM avisos
  WHERE deletado_em IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM avisos_publicos_alvo ap WHERE ap.aviso_id = avisos.id
    );
  RAISE NOTICE 'Dados de publico_alvo migrados para avisos_publicos_alvo.';

END $$;

CREATE INDEX IF NOT EXISTS idx_avisos_publicos_alvo_aviso_id ON avisos_publicos_alvo (aviso_id);
CREATE INDEX IF NOT EXISTS idx_avisos_publicos_alvo_perfil ON avisos_publicos_alvo (perfil);
