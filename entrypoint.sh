#!/bin/bash
# =============================================================================
# entrypoint.sh — inicialização do ambiente de desenvolvimento Carômetro
# =============================================================================
set -euo pipefail

# Cores para output legível
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
echo "  ║   Carômetro — Dev Environment (Replit)   ║"
echo "  ║   Node 20 · pnpm 10 · PostgreSQL 16      ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ---------------------------------------------------------------------------
# 1. Verificar que estamos dentro do workspace correto
# ---------------------------------------------------------------------------
step "Verificando workspace"
if [ ! -f "/workspace/pnpm-workspace.yaml" ]; then
  err "Arquivo pnpm-workspace.yaml não encontrado em /workspace"
  err "Monte o repositório com: -v /caminho/do/repo:/workspace"
  exit 1
fi
ok "Workspace encontrado: $(basename $(pwd))"
info "Node: $(node --version)"
info "pnpm: $(pnpm --version)"
info "git:  $(git --version | awk '{print $3}')"

# ---------------------------------------------------------------------------
# 2. Iniciar PostgreSQL local (se DATABASE_URL não apontar para externo)
# ---------------------------------------------------------------------------
step "Configurando banco de dados"

USE_LOCAL_PG=false
if [ -z "${DATABASE_URL:-}" ] || echo "${DATABASE_URL}" | grep -q "localhost\|127.0.0.1\|db:5432"; then
  USE_LOCAL_PG=true
fi

if [ "$USE_LOCAL_PG" = "true" ]; then
  info "Iniciando PostgreSQL 16 local..."

  # Iniciar como postgres (requer sudo ou ser postgres)
  sudo -u postgres pg_ctlcluster 16 main start 2>/dev/null || {
    warn "Tentando iniciar PostgreSQL de outra forma..."
    pg_ctlcluster 16 main start 2>/dev/null || true
  }

  sleep 2

  # Verificar se está rodando
  if pg_isready -h localhost -p 5432 -q 2>/dev/null; then
    ok "PostgreSQL rodando na porta 5432"

    # Criar role e banco se não existirem
    PGUSER="${PGUSER:-carometro}"
    PGPASSWORD="${PGPASSWORD:-carometro}"
    PGDATABASE="${PGDATABASE:-carometro}"

    sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='${PGUSER}'" 2>/dev/null | grep -q "1" || {
      sudo -u postgres psql -c "CREATE USER ${PGUSER} WITH PASSWORD '${PGPASSWORD}';" 2>/dev/null
      ok "Usuário '${PGUSER}' criado"
    }

    sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'" 2>/dev/null | grep -q "1" || {
      sudo -u postgres psql -c "CREATE DATABASE ${PGDATABASE} OWNER ${PGUSER};" 2>/dev/null
      ok "Banco '${PGDATABASE}' criado"
    }

    # Montar DATABASE_URL se não foi fornecida
    if [ -z "${DATABASE_URL:-}" ]; then
      export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@localhost:5432/${PGDATABASE}"
      info "DATABASE_URL: ${DATABASE_URL}"
    fi
  else
    warn "PostgreSQL não iniciou. Certifique-se de passar DATABASE_URL no .env"
  fi
else
  ok "Usando banco externo: ${DATABASE_URL%%@*}@..."
fi

# ---------------------------------------------------------------------------
# 3. Instalar dependências pnpm
# ---------------------------------------------------------------------------
step "Instalando dependências pnpm"

if [ -f "pnpm-lock.yaml" ]; then
  info "Lock file encontrado — usando frozen-lockfile"
  # minimumReleaseAge pode causar falha com --frozen-lockfile em algumas versões
  # Usamos --prefer-frozen-lockfile para ser mais tolerante
  pnpm install --prefer-frozen-lockfile 2>&1 | tail -5
  ok "Dependências instaladas"
else
  warn "Sem lock file — instalando com pnpm install"
  pnpm install 2>&1 | tail -5
  ok "Dependências instaladas (sem lock)"
fi

# ---------------------------------------------------------------------------
# 4. Aplicar schema do banco (drizzle-kit push)
# ---------------------------------------------------------------------------
step "Aplicando schema do banco"

if pnpm --filter @workspace/db run push 2>&1; then
  ok "Schema aplicado com sucesso"
else
  warn "Falha ao aplicar schema — verifique DATABASE_URL e tente manualmente:"
  info "  pnpm --filter @workspace/db run push"
fi

# ---------------------------------------------------------------------------
# 5. Verificar se precisa criar admin inicial
# ---------------------------------------------------------------------------
step "Verificando usuário administrador"

# Verificar se existe algum usuário na tabela
ADMIN_EXISTS=$(PGPASSWORD="${PGPASSWORD:-carometro}" psql \
  "${DATABASE_URL}" \
  -t -c "SELECT COUNT(*) FROM usuarios WHERE codigo_acesso IS NOT NULL;" \
  2>/dev/null | tr -d ' ' || echo "0")

if [ "${ADMIN_EXISTS:-0}" = "0" ] || [ -z "${ADMIN_EXISTS:-}" ]; then
  warn "Nenhum usuário encontrado. Criando administrador inicial..."
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@escola.edu.br}"

  if pnpm --filter @workspace/scripts run seed-admin "${ADMIN_EMAIL}" 2>&1; then
    ok "Administrador criado: ${ADMIN_EMAIL}"
    info "Guarde o código de acesso e senha exibidos acima!"
  else
    warn "Não foi possível criar admin automaticamente."
    info "Crie manualmente com: pnpm --filter @workspace/scripts run seed-admin seu@email.com"
  fi
else
  ok "Usuários existentes: ${ADMIN_EXISTS}"
fi

# ---------------------------------------------------------------------------
# 6. Exibir informações de acesso
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  Ambiente pronto!${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend${NC}   →  http://localhost:${PORT:-5000}"
echo -e "  ${CYAN}API${NC}        →  http://localhost:8080/api/healthz"
echo -e "  ${CYAN}PostgreSQL${NC} →  localhost:5432 / banco: ${PGDATABASE:-carometro}"
echo ""
echo -e "  ${YELLOW}Comandos úteis:${NC}"
echo -e "  pnpm --filter @workspace/db run push          # aplicar schema"
echo -e "  pnpm --filter @workspace/api-spec run codegen # regenerar hooks"
echo -e "  pnpm run typecheck                            # verificar tipos"
echo ""

# ---------------------------------------------------------------------------
# 7. Iniciar de acordo com o comando passado
# ---------------------------------------------------------------------------
CMD_ARG="${1:-dev}"

case "$CMD_ARG" in
  dev)
    step "Iniciando servidores de desenvolvimento"
    info "Frontend (Vite) na porta ${PORT:-5000}"
    info "Pressione Ctrl+C para parar"
    echo ""
    # Exatamente como o Replit executa (ver .replit → workflows)
    exec env PORT="${PORT:-5000}" BASE_PATH="${BASE_PATH:-/}" \
      pnpm --filter @workspace/carometro run dev
    ;;

  dev:all)
    step "Iniciando todos os servidores em paralelo"
    info "Frontend na porta ${PORT:-5000} + api-server na porta 8080"
    echo ""
    # Frontend em background, api-server em foreground
    PORT="${PORT:-5000}" BASE_PATH="${BASE_PATH:-/}" \
      pnpm --filter @workspace/carometro run dev &
    FRONTEND_PID=$!

    # Aguardar frontend iniciar
    sleep 3

    # api-server (se existir) — sempre na porta 8080 independente de PORT
    if [ -f "artifacts/api-server/package.json" ]; then
      PORT=8080 pnpm --filter @workspace/api-server run dev &
      API_PID=$!
      info "api-server PID: $API_PID"
    else
      warn "artifacts/api-server não encontrado — apenas frontend iniciado"
    fi

    info "Frontend PID: $FRONTEND_PID"
    echo ""
    # Manter container vivo e repassar sinais
    wait $FRONTEND_PID
    ;;

  shell)
    step "Abrindo shell interativo"
    exec /bin/bash
    ;;

  typecheck)
    step "Executando typecheck"
    exec pnpm run typecheck
    ;;

  codegen)
    step "Executando codegen (Orval)"
    exec pnpm --filter @workspace/api-spec run codegen
    ;;

  db:push)
    step "Aplicando schema do banco"
    exec pnpm --filter @workspace/db run push
    ;;

  seed)
    step "Criando administrador"
    EMAIL="${2:-admin@escola.edu.br}"
    exec pnpm --filter @workspace/scripts run seed-admin "$EMAIL"
    ;;

  *)
    # Passa qualquer outro comando direto para o shell
    exec "$@"
    ;;
esac
