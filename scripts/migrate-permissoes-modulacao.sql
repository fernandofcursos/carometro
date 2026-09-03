-- Migração: Permissões granulares do grupo Modulação
-- Cada item de menu do grupo Modulação tem sua própria permissão.
-- Idempotente — pode ser re-executada.
-- Execute: psql $DATABASE_URL -f scripts/migrate-permissoes-modulacao.sql

BEGIN;

INSERT INTO permissoes (recurso, acao)
VALUES
  ('cursos',     'manage'),
  ('turnos',     'manage'),
  ('turmas',     'manage'),
  ('disciplinas','manage'),
  ('horarios',   'manage'),
  ('calendario', 'manage')
ON CONFLICT (recurso, acao) DO NOTHING;

COMMIT;

\echo 'Permissões do grupo Modulação garantidas: cursos, turnos, turmas, disciplinas, horarios, calendario'
