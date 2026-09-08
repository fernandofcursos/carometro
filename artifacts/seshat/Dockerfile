# =============================================================================
# artifacts/seshat/Dockerfile — Fase 6
#
# Build em dois estágios:
#   1. builder — compila React + Vite → estáticos em dist/public
#   2. runtime — nginx serve os estáticos (o nginx.conf fica no serviço nginx)
#
# Nota: este Dockerfile gera APENAS os estáticos.
# O nginx.conf principal está em nginx/nginx.conf e é montado pelo docker-compose.
# =============================================================================

# -----------------------------------------------------------------------------
# Estágio 1: build do frontend
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copiar pacotes que o frontend precisa (lib/* são peer packages)
COPY lib/             ./lib/
COPY artifacts/seshat/ ./artifacts/seshat/

RUN npm install -g pnpm@10 --silent && \
    pnpm install --frozen-lockfile --silent

# Build de produção (Fase 6: sem source maps, sem HMR)
ENV NODE_ENV=production
ENV BASE_PATH=/
RUN pnpm --filter @workspace/seshat run build

# -----------------------------------------------------------------------------
# Estágio 2: servir estáticos via nginx
# O nginx.conf da Fase 6 (com TLS) é montado externamente pelo docker-compose.
# Este container serve apenas o conteúdo estático na porta 80 internamente.
# -----------------------------------------------------------------------------
FROM nginx:alpine AS runtime

# Remover config padrão do nginx (será sobrescrita pelo docker-compose)
RUN rm /etc/nginx/conf.d/default.conf

# Copiar estáticos do build
COPY --from=builder /app/artifacts/seshat/dist/public /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
