# =============================================================================
# Carômetro — Ambiente de Desenvolvimento (simula Replit)
#
# Replit usa:
#   - modules = ["nodejs-20"]  (Node 20.x via nix stable-25_05)
#   - pnpm ^10.34.1            (declarado em package.json / root)
#   - lockfileVersion: 9.0     (pnpm-lock.yaml)
#   - Linux x64                (esbuild overrides para linux-x64 apenas)
#   - PostgreSQL via DATABASE_URL externa (Neon cloud no Replit)
#
# Este container adiciona:
#   - PostgreSQL 16 local (para desenvolvimento sem depender de Neon)
#   - git, curl, wget, openssl (ferramentas de desenvolvimento)
#   - Porta 5000 (frontend Vite) e 8080 (api-server)
# =============================================================================

FROM node:22-bookworm-slim

# ---------------------------------------------------------------------------
# Metadados
# ---------------------------------------------------------------------------
LABEL maintainer="carometro-dev"
LABEL description="Ambiente de desenvolvimento Carômetro — simula Replit"
LABEL node.version="20"
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
# Usuário não-root para desenvolvimento (boa prática, simula Replit)
# ---------------------------------------------------------------------------
RUN useradd -m -s /bin/bash -u 1001 replit \
  && mkdir -p /home/replit/.pnpm-store \
  && chown -R replit:replit /home/replit

# ---------------------------------------------------------------------------
# PostgreSQL: configurar instância local
# ---------------------------------------------------------------------------
# Replit usa Neon (cloud) em produção, mas localmente precisamos de um PG.
# Criamos um cluster PostgreSQL 16 dentro do container.
RUN mkdir -p /var/run/postgresql /var/lib/postgresql/16/main \
  && chown -R postgres:postgres /var/run/postgresql /var/lib/postgresql \
  && su -c "pg_createcluster 16 main" postgres 2>/dev/null || true

# Configurações do PostgreSQL para desenvolvimento local
RUN echo "listen_addresses = '*'" >> /etc/postgresql/16/main/postgresql.conf \
  && echo "host all all 0.0.0.0/0 md5" >> /etc/postgresql/16/main/pg_hba.conf \
  && echo "host all all ::/0 md5" >> /etc/postgresql/16/main/pg_hba.conf

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
ENV PORT=5000
ENV BASE_PATH=/
# ENV LANG=pt_BR.UTF-8
ENV LANG=pt_BR.UTF-8 LANGUAGE=pt_BR:pt LC_ALL=pt_BR.UTF-8
ENV LC_ALL=pt_BR.UTF-8

# Replit expõe REPL_ID — deixamos vazio aqui para NÃO ativar plugins Replit
# (cartographer, dev-banner) que dependem de infra exclusiva do Replit
ENV REPL_ID=""

# pnpm store no volume para cache entre rebuilds
ENV PNPM_HOME=/home/replit/.pnpm-store
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

USER replit

ENTRYPOINT ["/entrypoint.sh"]
CMD ["dev"]
