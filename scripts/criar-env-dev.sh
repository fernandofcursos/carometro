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
  echo "[env] .env já existe — nenhuma ação necessária."
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
EOF

echo "[env] .env criado com configurações padrão de desenvolvimento."
echo "[env] Edite o arquivo para ajustar DATABASE_URL, SMTP, etc."
