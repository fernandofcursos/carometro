#!/bin/bash
# =============================================================================
# criar-env-dev.sh — cria .env de desenvolvimento se não existir
#
# Executado pelo initializeCommand do devcontainer NO HOST (Mac/Linux).
# NUNCA sobrescreve um .env existente — apenas cria se ausente.
#
# Uso:
#   bash scripts/criar-env-dev.sh
# =============================================================================

ENV_FILE="$(dirname "$0")/../.env"

if [ -f "$ENV_FILE" ]; then
  echo "[env] .env já existe — verificando variáveis obrigatórias..."
  # Docker Compose v5 usa Bake por padrão; o BuildKit v0.37.2 bloqueia leitura
  # de Dockerfiles temporários gerados pelo devcontainer CLI em /var/folders/...
  # COMPOSE_BAKE=false desabilita o Bake e restaura o comportamento anterior.
  if ! grep -q "^COMPOSE_BAKE=" "$ENV_FILE"; then
    echo "" >> "$ENV_FILE"
    echo "# Desabilita Docker Compose Bake (compatibilidade com BuildKit v0.37.2 / Docker Desktop 4.95+)" >> "$ENV_FILE"
    echo "COMPOSE_BAKE=false" >> "$ENV_FILE"
    echo "[env] COMPOSE_BAKE=false adicionado ao .env."
  fi
  exit 0
fi

echo "[env] Criando .env de desenvolvimento..."

cat > "$ENV_FILE" <<'EOF'
# =============================================================================
# .env — Desenvolvimento local (gerado automaticamente pelo devcontainer)
#
# PostgreSQL roda DENTRO do container dev (seshat-dev).
# Para usar Neon ou outro banco externo, ajuste DATABASE_URL abaixo.
# NUNCA commite este arquivo.
# =============================================================================

# ---------------------------------------------------------------------------
# Banco de dados — PostgreSQL interno ao container dev
# ---------------------------------------------------------------------------
DATABASE_URL=postgresql://seshat:seshat@localhost:5432/seshat

# ---------------------------------------------------------------------------
# Segurança da aplicação
# ---------------------------------------------------------------------------
SESSION_SECRET=dev-secret-troque-em-producao-minimo-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ENCRYPTION_KEY=bc30887220cb03c633dbb28769b0dc8796b64e4e62490e432534f72118a64288

# ---------------------------------------------------------------------------
# Aplicação
# ---------------------------------------------------------------------------
NODE_ENV=development
# PORT da API — padrão 8080 definido no código; descomente só se precisar trocar
# PORT=8080
BASE_PATH=/
LOG_LEVEL=debug
FRONTEND_URL=http://localhost:5000

# ---------------------------------------------------------------------------
# LGPD
# ---------------------------------------------------------------------------
POLITICA_VERSAO=1.0

# ---------------------------------------------------------------------------
# E-mail (SMTP) — configure para envio real ou deixe em branco para modo captura local
# ---------------------------------------------------------------------------
# SMTP_HOST=smtp.ethereal.email
# SMTP_PORT=587
# SMTP_USER=usuario@ethereal.email
# SMTP_PASS=senha-ethereal
# SMTP_FROM=Seshat <usuario@ethereal.email>

# ---------------------------------------------------------------------------
# Admin inicial (criado na primeira inicialização do banco)
# ---------------------------------------------------------------------------
ADMIN_EMAIL=admin@escola.edu.br

# ---------------------------------------------------------------------------
# Docker Compose — desabilita Bake (compatibilidade com BuildKit v0.37.2+)
# Docker Compose v5 usa Bake por padrão, o que bloqueia leitura de Dockerfiles
# temporários gerados pelo devcontainer CLI em /var/folders/... no macOS.
# ---------------------------------------------------------------------------
COMPOSE_BAKE=false
EOF

echo "[env] .env criado com configurações padrão de desenvolvimento."
echo "[env] Edite o arquivo para ajustar DATABASE_URL, SMTP, etc."
