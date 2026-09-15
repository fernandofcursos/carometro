-- Migração: Quadro de Horários
-- Execute: psql $DATABASE_URL -f scripts/migrate-horarios.sql
--
-- ATENÇÃO: Se você já executou migrate-dashboard.sql, a tabela horarios_aulas
-- existe com estrutura diferente (sem ano/semestre/disciplina_oferta_id).
-- Este script descarta e recria a tabela com o schema correto.
-- Faça backup antes se houver dados que queira preservar.

BEGIN;

-- ── Remover tabela legada (se existir com schema antigo) ──────────────────────
-- A versão antiga tinha: disciplina_id, turno_id, laboratorio, deletado_em
-- A nova versão usa:     disciplina_oferta_id, ano, semestre
DROP TABLE IF EXISTS horarios_aulas CASCADE;

-- ── horarios_aulas (schema definitivo) ───────────────────────────────────────
CREATE TABLE horarios_aulas (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id              uuid        NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_oferta_id  uuid        REFERENCES disciplina_ofertas(id) ON DELETE SET NULL,
  dia_semana            smallint    NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio           time        NOT NULL,
  hora_fim              time        NOT NULL,
  sala                  varchar(50),
  ano                   integer     NOT NULL,
  semestre              smallint    NOT NULL CHECK (semestre IN (1, 2)),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_horario_valido CHECK (hora_fim > hora_inicio),
  CONSTRAINT uq_slot_turma UNIQUE (turma_id, dia_semana, hora_inicio, ano, semestre)
);

COMMENT ON TABLE  horarios_aulas              IS 'Grade semanal de aulas por turma, disciplina, dia e horário';
COMMENT ON COLUMN horarios_aulas.dia_semana   IS '1=Segunda … 5=Sexta-feira';
COMMENT ON COLUMN horarios_aulas.disciplina_oferta_id IS 'Vínculo com a oferta da disciplina no curso/turno';
COMMENT ON COLUMN horarios_aulas.ano          IS 'Ano letivo do slot';
COMMENT ON COLUMN horarios_aulas.semestre     IS '1=Primeiro semestre, 2=Segundo semestre';

CREATE INDEX idx_horarios_turma ON horarios_aulas (turma_id, ano, semestre);

-- ── Permissão horarios:manage ─────────────────────────────────────────────────
INSERT INTO permissoes (recurso, acao)
  VALUES ('horarios', 'manage')
  ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;

\echo 'Migração horarios concluída: horarios_aulas + permissão horarios:manage'
