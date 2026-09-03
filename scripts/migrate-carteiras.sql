-- migrate-carteiras.sql — cria tabela de carteiras de estudante e cartões de liberação
-- Idempotente: seguro executar múltiplas vezes
-- Executar: psql $DATABASE_URL -f scripts/migrate-carteiras.sql

BEGIN;

CREATE TABLE IF NOT EXISTS carteiras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  matricula_id    uuid REFERENCES matriculas(id) ON DELETE SET NULL,
  tipo            varchar(20) NOT NULL DEFAULT 'carteira'
                    CHECK (tipo IN ('carteira', 'cartao-semestral')),
  ano             integer NOT NULL,
  semestre        smallint NOT NULL
                    CHECK (semestre IN (1, 2)),
  status          varchar(20) NOT NULL DEFAULT 'ativa'
                    CHECK (status IN ('ativa', 'cancelada', 'revogada')),
  token           text NOT NULL,
  cancelado_em    timestamptz,
  cancelado_por_id uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Adiciona horario_saida (cartao-semestral precisa do horário autorizado)
ALTER TABLE carteiras ADD COLUMN IF NOT EXISTS horario_saida time;

-- Índice para busca rápida por token (verificação pública de QR code)
CREATE INDEX IF NOT EXISTS ix_carteiras_token    ON carteiras(token);
-- Índice para listar carteiras de um estudante
CREATE INDEX IF NOT EXISTS ix_carteiras_usuario  ON carteiras(usuario_id);
-- Índice para gestão por semestre
CREATE INDEX IF NOT EXISTS ix_carteiras_periodo  ON carteiras(ano, semestre);

COMMIT;

SELECT 'migrate-carteiras.sql concluído com sucesso.' AS status;
