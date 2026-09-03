#!/bin/bash
# =============================================================================
# entrypoint.sh — ambiente de desenvolvimento Seshat
#
# Ciclo de vida do banco:
#   1. Se PGDATA não tiver PG_VERSION → inicializa cluster (somente 1ª vez)
#   2. Inicia PostgreSQL (rápido se já estiver rodando)
#   3. Cria role/banco seshat idempotente
#   4. Aplica extensões necessárias
#   5. Se hash do schema mudou → drizzle-kit push (só quando necessário)
#   6. Se banco nunca foi inicializado → seed-admin (somente 1ª vez)
#
# Persistência: volume externo seshat-pg-dev
#   → nunca removido por "docker compose down -v"
#   → para recriar: bash scripts/recriar-banco.sh --confirmar
#
# Migrations ao alterar schema:
#   bash scripts/gerar-migration.sh "descricao-da-mudanca"
#   psql $DATABASE_URL -f scripts/migrations/<arquivo>.sql
#   pnpm --filter @workspace/db run push-force
# =============================================================================

BOLD='\033[1m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ulimit -n 65536 2>/dev/null || true

# ── Carregar .env se existir ──────────────────────────────────────────────────
if [ -f /workspace/.env ]; then
  set -a; source /workspace/.env; set +a
elif [ -f "$(pwd)/.env" ]; then
  set -a; source "$(pwd)/.env"; set +a
fi

# ── Validar DATABASE_URL ──────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}[db] ERRO: DATABASE_URL não definida. Configure no .env${NC}"
fi

# ── Constantes ────────────────────────────────────────────────────────────────
PGDATA=/var/lib/postgresql/16/main
PGCONF=/etc/postgresql/16/main
PGLOG=/var/log/postgresql/postgresql-16-main.log
SCHEMA_HASH_FILE="$PGDATA/.seshat_schema_hash"
INIT_MARKER="$PGDATA/.seshat_initialized"

# ── Helpers de execução como postgres ────────────────────────────────────────
_run_as_postgres() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}

_psql_admin() {
  if [ "$(id -u)" = "0" ]; then
    runuser -u postgres -- psql -U postgres "$@"
  else
    psql -U postgres -h 127.0.0.1 "$@"
  fi
}

# ── Inicialização do cluster (somente primeira vez) ───────────────────────────
_init_cluster() {
  if [ -f "$PGDATA/PG_VERSION" ]; then
    return 0  # Cluster já inicializado
  fi

  echo -e "${CYAN}[db] Cluster não encontrado — inicializando (primeiro uso)...${NC}"

  # Garantir diretórios com permissões corretas
  mkdir -p "$PGDATA" /var/run/postgresql
  mkdir -p "$(dirname "$PGLOG")"
  chown -R postgres:postgres "$PGDATA" /var/run/postgresql "$(dirname "$PGLOG")" 2>/dev/null || true
  chmod 700 "$PGDATA"

  # Inicializar cluster com locale correto
  if ! _run_as_postgres pg_createcluster --locale pt_BR.UTF-8 --encoding UTF8 16 main 2>/dev/null; then
    # Fallback: initdb direto
    echo -e "${YELLOW}[db] pg_createcluster falhou, tentando initdb...${NC}"
    _run_as_postgres pg_ctl -D "$PGDATA" initdb -o "--locale=pt_BR.UTF-8 --encoding=UTF8" 2>/dev/null || {
      echo -e "${RED}[db] ERRO: Não foi possível inicializar o cluster PostgreSQL${NC}"
      return 1
    }
  fi

  # Aplicar configurações de rede e autenticação
  if [ -f "$PGCONF/postgresql.conf" ]; then
    echo "listen_addresses = '*'" >> "$PGCONF/postgresql.conf"
  else
    # Se o cluster foi inicializado via initdb, postgresql.conf está no PGDATA
    echo "listen_addresses = '*'" >> "$PGDATA/postgresql.conf"
  fi

  local HBA_FILE="$PGCONF/pg_hba.conf"
  [ ! -f "$HBA_FILE" ] && HBA_FILE="$PGDATA/pg_hba.conf"

  cat > "$HBA_FILE" <<'HBA'
# Dev container — trust para socket local do postgres, senha para os demais
local   all             postgres                                trust
local   all             all                                     scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
host    all             all             ::/0                    scram-sha-256
local   replication     all                                     trust
host    replication     all             0.0.0.0/0               scram-sha-256
HBA

  echo -e "${GREEN}[db] Cluster inicializado.${NC}"
}

# ── Iniciar PostgreSQL ────────────────────────────────────────────────────────
_iniciar_pg() {
  # Primeiro: garantir que o cluster existe
  _init_cluster || return 1

  mkdir -p /var/run/postgresql
  chown postgres:postgres /var/run/postgresql 2>/dev/null || true
  mkdir -p "$(dirname "$PGLOG")"
  chown postgres:postgres "$(dirname "$PGLOG")" 2>/dev/null || true
  touch "$PGLOG" && chown postgres:postgres "$PGLOG" 2>/dev/null || true

  # Tentar iniciar via pg_ctlcluster (prefere config em /etc/postgresql)
  if _run_as_postgres pg_ctlcluster 16 main start 2>/dev/null; then
    return 0
  fi

  # Fallback: pg_ctl direto
  if _run_as_postgres pg_ctl -D "$PGDATA" start -l "$PGLOG" 2>/dev/null; then
    return 0
  fi

  return 1
}

# ── Criar role e banco (idempotente) ─────────────────────────────────────────
_setup_db() {
  _psql_admin -c "CREATE USER seshat WITH PASSWORD 'seshat';;" 2>/dev/null || true
  _psql_admin -c "CREATE DATABASE seshat OWNER seshat;" 2>/dev/null || true
  _psql_admin -c "GRANT ALL PRIVILEGES ON DATABASE seshat TO seshat;" 2>/dev/null || true
  # Extensões necessárias
  _psql_admin -d seshat -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>/dev/null || true
  _psql_admin -d seshat -c "CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";" 2>/dev/null || true
  _psql_admin -d seshat -c "CREATE EXTENSION IF NOT EXISTS \"unaccent\";" 2>/dev/null || true
}

# ── Hash do schema (detecta mudanças) ────────────────────────────────────────
_schema_hash() {
  find /workspace/lib/db/src -name "*.ts" 2>/dev/null | sort | xargs sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1
}

# ── Instalar dependências Node se necessário ──────────────────────────────────
_ensure_deps() {
  # Verifica se o pacote db está compilado (necessário para drizzle-kit push)
  if [ ! -d /workspace/node_modules ] || [ ! -d /workspace/lib/db/node_modules 2>/dev/null ] && [ ! -f /workspace/node_modules/.modules.yaml ]; then
    echo -e "${CYAN}[db] Instalando dependências Node (pnpm install)...${NC}"
    (cd /workspace && pnpm install --frozen-lockfile 2>&1) || \
    (cd /workspace && pnpm install 2>&1) || {
      echo -e "${RED}[db] ERRO: pnpm install falhou. Verifique a conexão e o lockfile.${NC}"
      return 1
    }
    echo -e "${GREEN}[db] Dependências instaladas.${NC}"
  fi

  # Garantir que @workspace/db está compilado (drizzle-kit precisa dos types)
  if [ ! -d /workspace/lib/db/dist ]; then
    echo -e "${CYAN}[db] Compilando @workspace/db...${NC}"
    (cd /workspace && pnpm --filter @workspace/db run build 2>&1) || true
  fi
}

# ── Setup automático: schema push + seed ─────────────────────────────────────
_auto_setup() {
  # Garantir dependências antes de qualquer operação Node
  _ensure_deps || {
    echo -e "${RED}[db] Não foi possível instalar dependências. Schema e seed pulados.${NC}"
    return
  }

  local current_hash stored_hash=""
  current_hash=$(_schema_hash)
  [ -f "$SCHEMA_HASH_FILE" ] && stored_hash=$(cat "$SCHEMA_HASH_FILE")

  # Aplicar schema somente se mudou
  if [ "$current_hash" != "$stored_hash" ]; then
    echo -e "${CYAN}[db] Schema alterado — aplicando (drizzle-kit push)...${NC}"
    if (cd /workspace && pnpm --filter @workspace/db run push-force 2>&1); then
      echo "$current_hash" > "$SCHEMA_HASH_FILE"
      echo -e "${GREEN}[db] Schema aplicado com sucesso.${NC}"
    else
      echo -e "${RED}[db] AVISO: drizzle-kit push falhou. Verifique os logs.${NC}"
      return
    fi
  else
    echo -e "${GREEN}[db] Schema em dia — nenhuma atualização necessária.${NC}"
  fi

  # Seed do admin somente na primeira inicialização
  if [ ! -f "$INIT_MARKER" ]; then
    echo -e "${CYAN}[db] Primeira inicialização — criando usuário administrador...${NC}"
    if (cd /workspace && pnpm --filter @workspace/api-server run seed-admin 2>&1); then
      touch "$INIT_MARKER"
      echo -e "${GREEN}[db] Administrador criado com sucesso.${NC}"
    else
      echo -e "${RED}[db] AVISO: seed-admin falhou. Execute manualmente: pnpm --filter @workspace/api-server run seed-admin${NC}"
    fi
  fi
}

# ── Bloco principal: inicia PG se DATABASE_URL apontar para localhost ─────────
if echo "${DATABASE_URL:-}" | grep -qE 'localhost|127\.0\.0\.1'; then
  if ! pg_isready -q 2>/dev/null; then
    echo -e "${CYAN}[db] Iniciando PostgreSQL local...${NC}"
    if _iniciar_pg; then
      # Aguardar PG estar pronto (até 30s)
      for i in $(seq 1 30); do
        pg_isready -q 2>/dev/null && break
        sleep 1
      done
    fi
  fi

  if pg_isready -q 2>/dev/null; then
    echo -e "${GREEN}[db] PostgreSQL pronto.${NC}"
    _setup_db
    _auto_setup
  else
    echo -e "${RED}[db] AVISO: PostgreSQL não respondeu após 30s.${NC}"
    echo -e "${YELLOW}Tente manualmente:${NC}"
    echo -e "  runuser -u postgres -- pg_ctlcluster 16 main start   (como root)"
    echo -e "  pg_ctlcluster 16 main start                          (como postgres)"
    echo -e "Ou configure um banco externo (Neon) no .env"
  fi
fi

# ── Comandos ──────────────────────────────────────────────────────────────────
CMD_ARG="${1:-shell}"

case "$CMD_ARG" in
  shell)
    echo ""
    echo -e "${BOLD}Seshat Dev — shell interativo${NC}"
    echo -e "${CYAN}Banco de dados:${NC}"
    echo -e "  ${YELLOW}db:push${NC}          forçar reaplicação do schema (drizzle-kit push --force)"
    echo -e "  ${YELLOW}db:migrate DESC${NC}  gerar script SQL de migração para mudanças de schema"
    echo -e "  ${YELLOW}db:seed${NC}          recriar/verificar usuário administrador"
    echo -e "  ${YELLOW}db:hash-reset${NC}    forçar re-execução do push-force no próximo start"
    echo -e "${CYAN}Desenvolvimento:${NC}"
    echo -e "  ${YELLOW}PORT=8080 pnpm --filter @workspace/api-server run dev${NC}  subir API"
    echo -e "  ${YELLOW}pnpm --filter @workspace/seshat run dev${NC}                subir frontend"
    echo -e "  ${YELLOW}pnpm install${NC}                                           instalar dependências"
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
  db:migrate)
    exec bash /workspace/scripts/gerar-migration.sh "${@:2}"
    ;;
  db:seed)
    exec pnpm --filter @workspace/api-server run seed-admin "${@:2}"
    ;;
  seed)
    exec pnpm --filter @workspace/api-server run seed-admin "${@:2}"
    ;;
  db:hash-reset)
    echo -e "${YELLOW}[db] Removendo marcadores — próximo start reaplicará schema e seed...${NC}"
    rm -f "$SCHEMA_HASH_FILE" "$INIT_MARKER"
    echo -e "${GREEN}[db] Marcadores removidos.${NC}"
    ;;
  db:recriar)
    exec bash /workspace/scripts/recriar-banco.sh "${@:2}"
    ;;
  *)
    exec "$@"
    ;;
esac
