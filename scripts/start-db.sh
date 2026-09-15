#!/bin/bash
# =============================================================================
# start-db.sh — inicia o PostgreSQL local e garante usuário/banco
#
# Executado pelo postStartCommand do devcontainer a cada start.
# Pode ser rodado manualmente: bash scripts/start-db.sh
# =============================================================================

PGDATA=/var/lib/postgresql/16/main
PGCONF=/etc/postgresql/16/main

# Se PG já está pronto, sai imediatamente — restart rápido
if pg_isready -q 2>/dev/null; then
  echo "[db] PostgreSQL já está rodando."
  exit 0
fi

echo "[db] Iniciando PostgreSQL..."

mkdir -p /var/run/postgresql /var/log/postgresql
chown postgres:postgres /var/run/postgresql /var/log/postgresql 2>/dev/null || true

# Inicializa cluster se necessário (primeiro uso do volume)
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[db] Inicializando cluster (primeira vez)..."
  runuser -u postgres -- pg_createcluster --locale pt_BR.UTF-8 --encoding UTF8 16 main 2>/dev/null \
    || runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb -D "$PGDATA" \
         --locale=pt_BR.UTF-8 --encoding=UTF8 2>/dev/null || true

  # pg_hba.conf e listen_addresses (só na inicialização)
  cat > "$PGCONF/pg_hba.conf" <<'HBA'
local   all             postgres                                trust
local   all             all                                     scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
host    all             all             ::/0                    scram-sha-256
local   replication     all                                     trust
HBA
  grep -q "^listen_addresses" "$PGCONF/postgresql.conf" 2>/dev/null \
    || echo "listen_addresses = '*'" >> "$PGCONF/postgresql.conf"
fi

# Inicia PostgreSQL
runuser -u postgres -- pg_ctlcluster 16 main start 2>/dev/null \
  || runuser -u postgres -- pg_ctl -D "$PGDATA" start \
       -l /var/log/postgresql/postgresql-16-main.log 2>/dev/null || true

# Aguarda (máximo 15s)
for i in $(seq 1 15); do
  pg_isready -q 2>/dev/null && break
  sleep 1
done

if ! pg_isready -q 2>/dev/null; then
  echo "[db] ERRO: PostgreSQL não respondeu após 15s." >&2
  exit 1
fi

echo "[db] PostgreSQL pronto."

# Cria usuário e banco idempotente
_psql() { runuser -u postgres -- psql -U postgres -d postgres -c "$1" 2>/dev/null || true; }
_psql "CREATE USER seshat WITH PASSWORD 'seshat';"
_psql "CREATE DATABASE seshat OWNER seshat;"
_psql "GRANT ALL PRIVILEGES ON DATABASE seshat TO seshat;"
runuser -u postgres -- psql -U postgres -d seshat \
  -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"; CREATE EXTENSION IF NOT EXISTS \"unaccent\";" \
  2>/dev/null || true

echo "[db] Pronto — postgresql://seshat:seshat@localhost:5432/seshat"
