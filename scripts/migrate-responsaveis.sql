-- migrate-responsaveis.sql — cria tabelas do portal do responsável
-- Idempotente: seguro executar múltiplas vezes
-- Executar: psql $DATABASE_URL -f scripts/migrate-responsaveis.sql

BEGIN;

-- ── responsaveis_estudantes — vínculo pai/responsável ↔ estudante ─────────────
CREATE TABLE IF NOT EXISTS responsaveis_estudantes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  estudante_id    uuid NOT NULL REFERENCES estudantes(id) ON DELETE CASCADE,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  criado_por_id   uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT uq_responsavel_estudante UNIQUE (usuario_id, estudante_id)
);

CREATE INDEX IF NOT EXISTS ix_resp_est_usuario   ON responsaveis_estudantes(usuario_id);
CREATE INDEX IF NOT EXISTS ix_resp_est_estudante ON responsaveis_estudantes(estudante_id);

-- ── cartoes_saida — solicitação de cartão de saída ────────────────────────────
CREATE TABLE IF NOT EXISTS cartoes_saida (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudante_id          uuid NOT NULL REFERENCES estudantes(id) ON DELETE CASCADE,
  responsavel_id        uuid NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  data_saida            date NOT NULL,
  horario_saida         time,
  motivo                varchar(300),
  status                varchar(20) NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  aprovado_por_id       uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  aprovado_em           timestamptz,
  observacao_aprovador  varchar(300),
  token                 varchar(400),
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cartoes_saida_estudante    ON cartoes_saida(estudante_id);
CREATE INDEX IF NOT EXISTS ix_cartoes_saida_responsavel  ON cartoes_saida(responsavel_id);
CREATE INDEX IF NOT EXISTS ix_cartoes_saida_status       ON cartoes_saida(status);
CREATE INDEX IF NOT EXISTS ix_cartoes_saida_data         ON cartoes_saida(data_saida);

-- ── atestados_medicos — atestado enviado pelo responsável (dado sensível LGPD) ─
CREATE TABLE IF NOT EXISTS atestados_medicos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudante_id     uuid NOT NULL REFERENCES estudantes(id) ON DELETE CASCADE,
  responsavel_id   uuid NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  data_inicio      date NOT NULL,
  data_fim         date,
  nome_arquivo     varchar(200) NOT NULL,
  mime_type        varchar(60)  NOT NULL DEFAULT 'application/pdf',
  tamanho_bytes    integer NOT NULL,
  iv               char(24) NOT NULL,
  hash_integridade char(64) NOT NULL,
  dados            bytea NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_atestados_estudante   ON atestados_medicos(estudante_id);
CREATE INDEX IF NOT EXISTS ix_atestados_responsavel ON atestados_medicos(responsavel_id);
CREATE INDEX IF NOT EXISTS ix_atestados_data        ON atestados_medicos(data_inicio);

COMMIT;

SELECT 'migrate-responsaveis.sql concluído com sucesso.' AS status;
