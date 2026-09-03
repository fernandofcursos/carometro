-- =============================================================================
-- init-n8n-db.sql
--
-- Cria banco de dados dedicado para o n8n.
-- Executado pelo PostgreSQL na inicialização do container
-- (docker-entrypoint-initdb.d).
--
-- Segurança (ISO 27001 A.8.18 — Mínimo Privilégio):
--   - Banco isolado: workflows e credenciais do n8n separados do seshat
--   - O usuário ${POSTGRES_USER} precisa de acesso apenas ao banco n8n
-- =============================================================================

SELECT 'CREATE DATABASE seshat_n8n'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'seshat_n8n'
)\gexec
