BEGIN;

-- Rename das 10 tabelas
ALTER TABLE IF EXISTS aee_estudantes        RENAME TO eeaa_estudantes;
ALTER TABLE IF EXISTS aee_planos            RENAME TO eeaa_planos;
ALTER TABLE IF EXISTS aee_plano_assinaturas RENAME TO eeaa_plano_assinaturas;
ALTER TABLE IF EXISTS aee_plano_adaptacoes  RENAME TO eeaa_plano_adaptacoes;
ALTER TABLE IF EXISTS aee_metas             RENAME TO eeaa_metas;
ALTER TABLE IF EXISTS aee_evolucoes         RENAME TO eeaa_evolucoes;
ALTER TABLE IF EXISTS aee_sessoes           RENAME TO eeaa_sessoes;
ALTER TABLE IF EXISTS aee_laudos            RENAME TO eeaa_laudos;
ALTER TABLE IF EXISTS aee_liberacoes        RENAME TO eeaa_liberacoes;
ALTER TABLE IF EXISTS aee_auditoria         RENAME TO eeaa_auditoria;

-- Rename de índices (falha silenciosamente se já renomeado)
DO $$ BEGIN
  ALTER INDEX idx_aee_estudantes_escola    RENAME TO idx_eeaa_estudantes_escola;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_estudantes_usuario   RENAME TO idx_eeaa_estudantes_usuario;   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_planos_estudante     RENAME TO idx_eeaa_planos_estudante;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_laudos_estudante     RENAME TO idx_eeaa_laudos_estudante;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_sessoes_estudante    RENAME TO idx_eeaa_sessoes_estudante;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_liberacoes_estudante RENAME TO idx_eeaa_liberacoes_estudante; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_liberacoes_professor RENAME TO idx_eeaa_liberacoes_professor; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_usuario    RENAME TO idx_eeaa_auditoria_usuario;    EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_estudante  RENAME TO idx_eeaa_auditoria_estudante;  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX idx_aee_auditoria_criado     RENAME TO idx_eeaa_auditoria_criado;     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER INDEX uq_aee_assinatura            RENAME TO uq_eeaa_assinatura;            EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Novas permissões EEAA
INSERT INTO permissoes (recurso, acao) VALUES
  ('eeaa', 'manage'),
  ('eeaa', 'view')
ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;
