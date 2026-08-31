-- Migração: Calendário Pedagógico
-- Execute: psql $DATABASE_URL -f scripts/migrate-calendario.sql

BEGIN;

-- ── Semestres letivos ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendario_semestres (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ano           integer     NOT NULL,
  semestre      smallint    NOT NULL CHECK (semestre IN (1, 2)),
  inicio        date        NOT NULL,
  fim           date        NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_calendario_ano_semestre UNIQUE (ano, semestre),
  CONSTRAINT chk_semestre_datas CHECK (fim > inicio)
);

COMMENT ON TABLE calendario_semestres IS 'Datas de início e fim de cada semestre letivo por ano';

-- ── Eventos do calendário por dia ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendario_dias (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data          date        NOT NULL,
  categoria     varchar(30) NOT NULL DEFAULT 'letivo',
  titulo        varchar(200),
  descricao     text,
  cor_override  varchar(7),
  icone         varchar(10),
  criado_por    uuid        REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_categoria CHECK (categoria IN (
    'letivo','feriado_nacional','feriado_distrital','recesso',
    'evento','formacao','atividade_pedagogica','nao_letivo','semana_pedagogica'
  ))
);

-- Uma data pode ter múltiplos registros (feriado + evento, por exemplo)
CREATE INDEX IF NOT EXISTS idx_calendario_dias_data
  ON calendario_dias (data);

CREATE INDEX IF NOT EXISTS idx_calendario_dias_ano
  ON calendario_dias (EXTRACT(year FROM data)::integer, data);

COMMENT ON TABLE calendario_dias IS 'Eventos e marcações do calendário escolar por data';
COMMENT ON COLUMN calendario_dias.cor_override IS 'Cor hexadecimal personalizada; substitui a cor padrão da categoria';
COMMENT ON COLUMN calendario_dias.categoria IS
  'letivo | feriado_nacional | feriado_distrital | recesso | evento | formacao | atividade_pedagogica | nao_letivo | semana_pedagogica';

-- Permissão calendario:manage (inserir na tabela de permissões se existir)
INSERT INTO permissoes (recurso, acao)
  VALUES ('calendario', 'manage')
  ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;

\echo 'Migração calendário concluída: calendario_semestres + calendario_dias'
