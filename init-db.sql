-- =============================================================================
-- init-db.sql — Configurações iniciais do banco PostgreSQL
-- Executado automaticamente pelo postgres:16-alpine no primeiro start
-- =============================================================================

-- Extensões úteis para o projeto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- geração de UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- funções criptográficas
CREATE EXTENSION IF NOT EXISTS "unaccent";     -- busca sem acentos (pt-BR)

-- Garantir encoding correto
SET client_encoding = 'UTF8';

-- Schema padrão pertence ao usuário da aplicação
ALTER DATABASE carometro OWNER TO carometro;
GRANT ALL PRIVILEGES ON DATABASE carometro TO carometro;
