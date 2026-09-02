-- Migration: Anexos de Avisos e Informes
-- Execute: psql "$DATABASE_URL" -f scripts/migrate-avisos-anexos.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'avisos_anexos') THEN
    CREATE TABLE avisos_anexos (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      aviso_id       uuid        NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
      nome_original  varchar(255) NOT NULL,
      nome_arquivo   varchar(100) NOT NULL, -- uuid.ext on disk
      mime_type      varchar(100) NOT NULL,
      tamanho        integer     NOT NULL,  -- bytes
      criado_em      timestamptz NOT NULL DEFAULT now()
    );
    RAISE NOTICE 'Tabela avisos_anexos criada.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_avisos_anexos_aviso_id ON avisos_anexos (aviso_id);
