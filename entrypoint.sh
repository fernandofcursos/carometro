#!/bin/bash
# =============================================================================
# entrypoint.sh — inicialização do ambiente de desenvolvimento Carômetro
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step() { echo -e "\n${BLUE}▶${NC} ${BOLD}$1${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
err()  { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${CYAN}·${NC} $1"; }

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║      Carômetro — Dev Environment         ║"
echo "  ║   Node 22 · pnpm 10 · PostgreSQL 16      ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ---------------------------------------------------------------------------
# 1. Verificar workspace
# ---------------------------------------------------------------------------
step "Verificando workspace"
if [ ! -f "/workspace/pnpm-workspace.yaml" ]; then
  err "pnpm-workspace.yaml não encontrado em /workspace"
  exit 1
fi
ok "Workspace: /workspace"
info "Node: $(node --version)"
info "pnpm: $(pnpm --version)"

# ---------------------------------------------------------------------------
# 2. Banco de dados — local ou externo (Neon)
# ---------------------------------------------------------------------------
step "Configurando banco de dados"

USE_LOCAL_PG=false
if [ -z "${DATABASE_URL:-}" ] || echo "${DATABASE_URL}" | grep -qE "localhost|127\.0\.0\.1|db:5432"; then
  USE_LOCAL_PG=true
fi

if [ "$USE_LOCAL_PG" = "true" ]; then
  info "DATABASE_URL aponta para localhost — iniciando PostgreSQL 16 interno..."

  sudo -u postgres pg_ctlcluster 16 main start 2>/dev/null || \
    pg_ctlcluster 16 main start 2>/dev/null || true

  sleep 2

  if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    ok "PostgreSQL local rodando na porta 5432"

    PG_USER="${PGUSER:-carometro}"
    PG_PASS="${PGPASSWORD:-carometro}"
    PG_DB="${PGDATABASE:-carometro}"

    sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" 2>/dev/null | grep -q "1" || {
      sudo -u postgres psql -c "CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}';" 2>/dev/null
      ok "Usuário '${PG_USER}' criado"
    }

    sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" 2>/dev/null | grep -q "1" || {
      sudo -u postgres psql -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER};" 2>/dev/null
      ok "Banco '${PG_DB}' criado"
    }

    if [ -z "${DATABASE_URL:-}" ]; then
      export DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}"
    fi
    info "DATABASE_URL: postgresql://${PG_USER}:****@localhost:5432/${PG_DB}"
  else
    warn "PostgreSQL local não iniciou — verifique DATABASE_URL"
  fi
else
  # Externo (Neon, RDS, etc.) — apenas validar conectividade
  DB_HOST=$(echo "${DATABASE_URL}" | sed -n 's|.*@\([^:/]*\).*|\1|p')
  ok "Usando banco externo: ${DB_HOST}"
  info "Testando conexão..."
  if pg_isready -d "${DATABASE_URL}" -q 2>/dev/null; then
    ok "Conexão com banco externo OK"
  else
    warn "Não foi possível verificar conectividade (pg_isready). Continuando..."
    info "Se o schema falhar, verifique DATABASE_URL"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Instalar dependências pnpm (apenas se node_modules não existir)
# ---------------------------------------------------------------------------
step "Verificando dependências"

if [ -d "node_modules" ] && [ -d "artifacts/carometro/node_modules" ]; then
  ok "node_modules já existe — pulando install"
else
  info "Instalando dependências pnpm..."
  pnpm install --prefer-frozen-lockfile 2>&1 | tail -5
  ok "Dependências instaladas"
fi

# ---------------------------------------------------------------------------
# 4. Aplicar schema do banco
# ---------------------------------------------------------------------------
step "Aplicando schema do banco"

if pnpm --filter @workspace/db run push 2>&1 | tail -3; then
  ok "Schema aplicado"
else
  warn "Falha ao aplicar schema. Tente manualmente:"
  info "  pnpm --filter @workspace/db run push"
fi

# ---------------------------------------------------------------------------
# 5. Criar admin inicial (somente se banco vazio)
# ---------------------------------------------------------------------------
step "Verificando usuário administrador"

ADMIN_EXISTS=$(psql "${DATABASE_URL}" -t -c \
  "SELECT COUNT(*) FROM usuarios WHERE codigo_acesso IS NOT NULL;" \
  2>/dev/null | tr -d ' \n' || echo "0")

if [ "${ADMIN_EXISTS:-0}" = "0" ] || [ -z "${ADMIN_EXISTS:-}" ]; then
  warn "Nenhum usuário encontrado. Criando admin inicial..."
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@escola.edu.br}"

  if pnpm --filter @workspace/scripts run seed-admin "${ADMIN_EMAIL}" 2>&1; then
    ok "Admin criado: ${ADMIN_EMAIL}"
    info "⚠  Guarde o código de acesso e senha exibidos acima!"
  else
    warn "Não foi possível criar admin automaticamente."
    info "Crie manualmente: pnpm --filter @workspace/scripts run seed-admin seu@email.com"
  fi
else
  ok "Usuários existentes: ${ADMIN_EXISTS}"
fi

# ---------------------------------------------------------------------------
# 6. Resumo de acesso
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Ambiente pronto!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend${NC}   →  http://localhost:5000"
echo -e "  ${CYAN}API${NC}        →  http://localhost:8080/api/healthz"
if [ "$USE_LOCAL_PG" = "true" ]; then
  echo -e "  ${CYAN}PostgreSQL${NC} →  localhost:5432 / banco: ${PGDATABASE:-carometro}"
else
  echo -e "  ${CYAN}Banco${NC}      →  Neon (cloud)"
fi
echo ""
echo -e "  ${YELLOW}Tasks VSCode:${NC} Ctrl+Shift+B  →  sobe frontend + api"
echo -e "  ${YELLOW}Manualmente:${NC}"
echo -e "    PORT=5000 BASE_PATH=/ pnpm --filter @workspace/carometro run dev"
echo -e "    PORT=8080 pnpm --filter @workspace/api-server run dev"
echo ""

# ---------------------------------------------------------------------------
# 7. Executar comando
# ---------------------------------------------------------------------------
CMD_ARG="${1:-dev}"

case "$CMD_ARG" in
  dev)
    step "Iniciando Frontend (Vite) na porta 5000"
    exec env PORT=5000 BASE_PATH="${BASE_PATH:-/}" \
      pnpm --filter @workspace/carometro run dev
    ;;

  dev:all)
    step "Iniciando Frontend + API em paralelo"
    PORT=5000 BASE_PATH="${BASE_PATH:-/}" \
      pnpm --filter @workspace/carometro run dev &
    FRONTEND_PID=$!

    sleep 3

    if [ -f "artifacts/api-server/package.json" ]; then
      PORT=8080 pnpm --filter @workspace/api-server run dev &
      API_PID=$!
      info "api-server PID: $API_PID"
    else
      warn "api-server não encontrado"
    fi

    info "Frontend PID: $FRONTEND_PID"
    wait $FRONTEND_PID
    ;;

  shell)
    step "Shell interativo"
    exec /bin/bash
    ;;

  typecheck)
    exec pnpm run typecheck
    ;;

  codegen)
    exec pnpm --filter @workspace/api-spec run codegen
    ;;

  db:push)
    exec pnpm --filter @workspace/db run push
    ;;

  seed)
    EMAIL="${2:-admin@escola.edu.br}"
    exec pnpm --filter @workspace/scripts run seed-admin "$EMAIL"
    ;;

  *)
    exec "$@"
    ;;
esac
