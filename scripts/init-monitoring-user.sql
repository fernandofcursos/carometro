-- =============================================================================
-- init-monitoring-user.sql
--
-- Cria usuário dedicado de leitura para o postgres-exporter.
-- Executado automaticamente pelo PostgreSQL na inicialização do container
-- (docker-entrypoint-initdb.d).
--
-- Segurança (ISO 27001 A.8.18 / Mínimo Privilégio):
--   - Apenas SELECT em pg_stat_* e pg_locks (sem acesso às tabelas da aplicação)
--   - Senha definida via variável de ambiente PG_EXPORTER_PASSWORD no .env
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seshat_monitor') THEN
    -- A senha real é injetada via variável de ambiente no docker-compose.prod.yml.
    -- Em produção, altere para: CREATE USER seshat_monitor WITH PASSWORD :'PG_EXPORTER_PASSWORD';
    -- usando psql -v PG_EXPORTER_PASSWORD="$PG_EXPORTER_PASSWORD"
    EXECUTE format(
      'CREATE USER seshat_monitor WITH PASSWORD %L LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE',
      current_setting('app.pg_exporter_password', true)
    );
  END IF;
END
$$;

-- Permissões mínimas para o postgres-exporter (pg_monitor = role nativa PG 10+)
GRANT pg_monitor TO seshat_monitor;
