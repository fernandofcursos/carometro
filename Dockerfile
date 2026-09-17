# =============================================================================
# Carômetro — Ambiente de Desenvolvimento
#
# - Node 22 + pnpm 10
# - PostgreSQL 16 local (iniciado pelo entrypoint como root via runuser)
# - git, curl, openssl e ferramentas de desenvolvimento
# - Porta 5000 (frontend Vite) e 8080 (api-server)
# =============================================================================

FROM node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Metadados
# ---------------------------------------------------------------------------
LABEL maintainer="seshat-dev"
LABEL description="Seshat — Ambiente de desenvolvimento"
LABEL node.version="22"
LABEL pnpm.version="10"

# ---------------------------------------------------------------------------
# Sistema: ferramentas base + PostgreSQL 16 client + server
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget ca-certificates gnupg lsb-release \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
     -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
     https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
     > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs python3 make g++ \
    procps htop jq unzip openssl \
    postgresql-16 postgresql-client-16 \
    locales \
  && echo "pt_BR.UTF-8 UTF-8" >> /etc/locale.gen \
  && locale-gen \
  && update-locale LANG=pt_BR.UTF-8 \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# pnpm — versão exata alinhada com o projeto
# ---------------------------------------------------------------------------
# O package.json raiz declara "pnpm": "^10.34.1"
# Usamos corepack para gerenciar versões de forma segura
#RUN corepack enable && corepack prepare pnpm@10.13.1 --activate 
RUN corepack disable && npm install -g pnpm@10.13.1

# ---------------------------------------------------------------------------
# PostgreSQL: criar diretórios e pré-configurar (o cluster é inicializado
# pelo entrypoint na primeira vez, dentro do volume persistente)
# ---------------------------------------------------------------------------
RUN mkdir -p /var/run/postgresql /var/lib/postgresql /var/log/postgresql \
  && chown -R postgres:postgres /var/run/postgresql /var/lib/postgresql /var/log/postgresql

# Pré-criar o diretório de configuração e deixar os arquivos de conf prontos.
# pg_createcluster cria o cluster no PGDATA (montado em volume) durante o
# primeiro start via entrypoint — nunca durante o build — para que o volume
# persista os dados entre reinicializações.
RUN mkdir -p /etc/postgresql/16/main \
  && pg_createcluster --locale pt_BR.UTF-8 --encoding UTF8 16 main 2>/dev/null || true

# Sobrescrever configurações após pg_createcluster (tolerante a falha)
RUN if [ -f /etc/postgresql/16/main/postgresql.conf ]; then \
      echo "listen_addresses = '*'" >> /etc/postgresql/16/main/postgresql.conf; \
    fi \
  && cat > /etc/postgresql/16/main/pg_hba.conf <<'HBA'
# Dev container — trust para postgres local, senha para demais
local   all             postgres                                trust
local   all             all                                     scram-sha-256
host    all             all             0.0.0.0/0               scram-sha-256
host    all             all             ::/0                    scram-sha-256
local   replication     all                                     trust
host    replication     all             0.0.0.0/0               scram-sha-256
HBA

# ---------------------------------------------------------------------------
# Diretório de trabalho — onde o repositório será montado
# ---------------------------------------------------------------------------
WORKDIR /workspace

# ---------------------------------------------------------------------------
# Configuração do git global (para commits dentro do container)
# ---------------------------------------------------------------------------
RUN git config --global --add safe.directory /workspace \
  && git config --global core.autocrlf input \
  && git config --global init.defaultBranch main

# ---------------------------------------------------------------------------
# Variáveis de ambiente padrão (sobrescritas pelo .env no docker-compose)
# ---------------------------------------------------------------------------
ENV NODE_ENV=development
# PORT não definido aqui — API usa fallback 8080 (src/index.ts), Vite usa VITE_PORT ou 5000
ENV BASE_PATH=/
# ENV LANG=pt_BR.UTF-8
ENV LANG=pt_BR.UTF-8 LANGUAGE=pt_BR:pt LC_ALL=pt_BR.UTF-8
ENV LC_ALL=pt_BR.UTF-8

# pnpm store no volume para cache entre rebuilds
ENV PNPM_HOME=/root/.pnpm-store
ENV PATH="$PNPM_HOME:$PATH"

# ---------------------------------------------------------------------------
# Portas expostas
# ---------------------------------------------------------------------------
EXPOSE 5000
EXPOSE 8080
EXPOSE 5432

# ---------------------------------------------------------------------------
# Script de entrypoint
# ---------------------------------------------------------------------------
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["shell"]
