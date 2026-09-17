BEGIN;

-- Extender encaminhamentos_eventos com campos do workflow
ALTER TABLE encaminhamentos_eventos
  ADD COLUMN IF NOT EXISTS tipo_demanda varchar(100),
  ADD COLUMN IF NOT EXISTS cids         text[],
  ADD COLUMN IF NOT EXISTS resolucao    text,
  ADD COLUMN IF NOT EXISTS pai_id       uuid REFERENCES encaminhamentos_eventos(id) ON DELETE SET NULL;

-- Ampliar CHECK de status
ALTER TABLE encaminhamentos_eventos
  DROP CONSTRAINT IF EXISTS encaminhamentos_eventos_status_check;
ALTER TABLE encaminhamentos_eventos
  ADD CONSTRAINT encaminhamentos_eventos_status_check
  CHECK (status IN ('pendente','aceito','em_andamento','devolvido','resolvido','arquivado'));

CREATE INDEX IF NOT EXISTS idx_enc_eventos_pai ON encaminhamentos_eventos(pai_id);

COMMIT;
