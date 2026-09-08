-- Migração: Dashboard — horarios_aulas + cardapios
-- Execute: psql $DATABASE_URL -f scripts/migrate-dashboard.sql

BEGIN;

-- ── horarios_aulas ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS horarios_aulas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id        uuid        NOT NULL REFERENCES turmas(id) ON DELETE RESTRICT,
  disciplina_id   uuid        NOT NULL REFERENCES disciplinas(id) ON DELETE RESTRICT,
  turno_id        uuid        REFERENCES turnos(id) ON DELETE SET NULL,
  dia_semana      smallint    NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio     time        NOT NULL,
  hora_fim        time        NOT NULL,
  sala            varchar(50),
  laboratorio     varchar(100),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  deletado_em     timestamptz,
  CONSTRAINT chk_hora_horarios CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_horarios_aulas_turma_dia
  ON horarios_aulas (turma_id, dia_semana)
  WHERE deletado_em IS NULL;

COMMENT ON TABLE horarios_aulas IS 'Grade de aulas por turma, disciplina e dia da semana';
COMMENT ON COLUMN horarios_aulas.dia_semana IS '1=Segunda … 5=Sexta-feira';

-- ── cardapios ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cardapios (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data          date        NOT NULL,
  refeicao      varchar(50) NOT NULL,
  descricao     text        NOT NULL,
  publicado     boolean     NOT NULL DEFAULT false,
  criado_por    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cardapio_data_refeicao
  ON cardapios (data, refeicao);

CREATE INDEX IF NOT EXISTS idx_cardapios_data_publicado
  ON cardapios (data, publicado);

COMMENT ON TABLE cardapios IS 'Cardápio da semana por dia e tipo de refeição';
COMMENT ON COLUMN cardapios.publicado IS 'Apenas publicado=true é exibido nos portais';

COMMIT;

\echo 'Migração dashboard concluída: horarios_aulas + cardapios'
