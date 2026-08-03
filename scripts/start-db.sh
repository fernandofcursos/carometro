#!/bin/bash
# =============================================================================
# start-db.sh — inicia o PostgreSQL local e garante usuário/banco
#
# Executado automaticamente pelo postStartCommand do devcontainer.
# Pode ser rodado manualmente a qualquer momento: bash scripts/start-db.sh
# =============================================================================

set -e

PGDATA=/var/lib/postgresql/16/main
PGCONF=/etc/postgresql/16/main
PGLOG=/var/log/postgresql/postgresql-16-main.log

echo "[db] Configurando PostgreSQL..."

# Garante diretório de socket com permissão correta
mkdir -p /var/run/postgresql
chown postgres:postgres /var/run/postgresql

# Garante diretório de log
mkdir -p /var/log/postgresql
chown postgres:postgres /var/log/postgresql

# Inicializa o cluster se o data dir estiver vazio (primeiro uso do volume)
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[db] Inicializando cluster PostgreSQL..."
  runuser -u postgres -- /usr/lib/postgresql/16/bin/initdb \
    -D "$PGDATA" \
    --locale=pt_BR.UTF-8 \
    --encoding=UTF8 2>/dev/null || true
fi

# Aplica pg_hba.conf sempre (garante auth correta mesmo após rebuild)
cat > "$PGCONF/pg_hba.conf" <<'HBA'
# Dev container — password auth via socket e TCP
local   all             postgres                                trust
local   all             all                                     scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
host    all             all             ::/0                    scram-sha-256
local   replication     all                                     trust
host    replication     all             0.0.0.0/0               scram-sha-256
HBA

# Garante listen_addresses no postgresql.conf
grep -q "^listen_addresses" "$PGCONF/postgresql.conf" \
  || echo "listen_addresses = '*'" >> "$PGCONF/postgresql.conf"
sed -i "s/^listen_addresses.*/listen_addresses = '*'/" "$PGCONF/postgresql.conf"

# Inicia ou reinicia o PostgreSQL
if pg_isready -q 2>/dev/null; then
  echo "[db] PostgreSQL já está rodando — recarregando configuração..."
  runuser -u postgres -- pg_ctlcluster 16 main reload 2>/dev/null || true
else
  echo "[db] Iniciando PostgreSQL..."
  runuser -u postgres -- pg_ctlcluster 16 main start

  # Aguarda ficar pronto
  for i in $(seq 1 20); do
    pg_isready -q 2>/dev/null && break
    sleep 1
  done
fi

if ! pg_isready -q 2>/dev/null; then
  echo "[db] ERRO: PostgreSQL não respondeu após 20s." >&2
  exit 1
fi

echo "[db] PostgreSQL pronto."

# Cria usuário e banco (idempotente — ignora erros se já existirem)
runuser -u postgres -- psql -U postgres -d postgres \
  -c "CREATE USER carometro WITH PASSWORD 'carometro';" 2>/dev/null || true
runuser -u postgres -- psql -U postgres -d postgres \
  -c "CREATE DATABASE carometro OWNER carometro;" 2>/dev/null || true
runuser -u postgres -- psql -U postgres -d postgres \
  -c "GRANT ALL PRIVILEGES ON DATABASE carometro TO carometro;" 2>/dev/null || true

echo "[db] Usuário e banco prontos."
echo "[db] DATABASE_URL: postgresql://carometro:carometro@localhost:5432/carometro"
