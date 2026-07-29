#!/bin/bash
# =============================================================================
# entrypoint.sh — ambiente de desenvolvimento Carômetro
# PostgreSQL local sobe automaticamente se DATABASE_URL apontar para localhost.
# =============================================================================

BOLD='\033[1m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ulimit -n 65536 2>/dev/null || true

# ── Carregar .env se existir (Replit não carrega automaticamente) ─────────────
if [ -f /workspace/.env ]; then
  set -a; source /workspace/.env; set +a
elif [ -f "$(pwd)/.env" ]; then
  set -a; source "$(pwd)/.env"; set +a
fi

# ── Detectar ambiente ─────────────────────────────────────────────────────────
_eh_replit() {
  [ -n "${REPL_ID:-}" ] || [ -n "${REPL_SLUG:-}" ] || [ -d /home/replit ]
}

# ── Validar DATABASE_URL ──────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}[db] ERRO: DATABASE_URL não definida.${NC}"
  if _eh_replit; then
    echo -e "${RED}      No Replit: adicione DATABASE_URL nos Secrets do projeto${NC}"
    echo -e "${RED}      (painel lateral → Secrets → + New Secret)${NC}"
  else
    echo -e "${RED}      Configure DATABASE_URL no .env${NC}"
  fi
fi

# ── PostgreSQL local — só no Dev Container (não no Replit) ───────────────────
_iniciar_pg() {
  pg_ctlcluster 16 main start 2>/dev/null \
    || su -s /bin/bash postgres -c "pg_ctlcluster 16 main start" 2>/dev/null \
    || true
}

_setup_db() {
  local PSQL="psql -U postgres"
  $PSQL -c "CREATE USER carometro WITH PASSWORD 'carometro';" 2>/dev/null || true
  $PSQL -c "CREATE DATABASE carometro OWNER carometro;" 2>/dev/null || true
  $PSQL -c "GRANT ALL PRIVILEGES ON DATABASE carometro TO carometro;" 2>/dev/null || true
}

if echo "${DATABASE_URL:-}" | grep -qE 'localhost|127\.0\.0\.1'; then
  if _eh_replit; then
    echo -e "${RED}[db] ERRO: DATABASE_URL aponta para localhost mas você está no Replit.${NC}"
    echo -e "${RED}      O Replit não tem PostgreSQL local. Use o banco Neon:${NC}"
    echo -e "${YELLOW}      1. Acesse https://neon.tech e crie/acesse seu projeto${NC}"
    echo -e "${YELLOW}      2. Copie a connection string (postgresql://...neon.tech/...)${NC}"
    echo -e "${YELLOW}      3. Adicione nos Secrets do Replit: DATABASE_URL = <connection string>${NC}"
    echo -e "${YELLOW}      4. Reinicie o Replit${NC}"
  else
    if ! pg_isready -q 2>/dev/null; then
      echo -e "${CYAN}[db] Iniciando PostgreSQL local...${NC}"
      _iniciar_pg
      for i in $(seq 1 15); do
        pg_isready -q 2>/dev/null && break
        sleep 1
      done
    fi
    if pg_isready -q 2>/dev/null; then
      echo -e "${GREEN}[db] PostgreSQL pronto.${NC}"
      _setup_db
    else
      echo -e "${RED}[db] AVISO: PostgreSQL não respondeu após 15s.${NC}"
      echo -e "${RED}      Inicie manualmente: pg_ctlcluster 16 main start${NC}"
    fi
  fi
fi

CMD_ARG="${1:-shell}"

# Comandos utilitários (usados pelo docker compose run --rm dev <cmd>)
case "$CMD_ARG" in
  shell)
    echo -e "${BOLD}Carômetro Dev — shell interativo${NC}"
    echo -e "${CYAN}Comandos disponíveis:${NC}"
    echo -e "  ${YELLOW}pnpm install${NC}                                   instalar dependências"
    echo -e "  ${YELLOW}pnpm --filter @workspace/db run push-force${NC}     aplicar schema"
    echo -e "  ${YELLOW}pnpm --filter @workspace/api-server run seed-admin${NC} criar admin"
    echo -e "  ${YELLOW}PORT=8080 pnpm --filter @workspace/api-server run dev${NC}  subir API"
    echo -e "  ${YELLOW}pnpm --filter @workspace/carometro run dev${NC}     subir frontend"
    echo ""
    exec /bin/bash
    ;;

  typecheck)
    exec pnpm run typecheck
    ;;

  codegen)
    exec pnpm --filter @workspace/api-spec run codegen
    ;;

  db:push)
    exec pnpm --filter @workspace/db run push-force
    ;;

  seed)
    EMAIL="${2:-admin@escola.edu.br}"
    exec pnpm --filter @workspace/api-server run seed-admin "$EMAIL"
    ;;

  *)
    exec "$@"
    ;;
esac
