-- Migração: Permissões do grupo Modulação
-- Garante que todas as permissões dos itens de menu do grupo Modulação
-- existam na tabela permissoes. Idempotente — pode ser re-executada.
-- Execute: psql $DATABASE_URL -f scripts/migrate-permissoes-modulacao.sql

BEGIN;

INSERT INTO permissoes (recurso, acao)
VALUES
  ('horarios',   'manage'),
  ('calendario', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;

\echo 'Permissões do grupo Modulação garantidas: horarios:manage + calendario:manage'
