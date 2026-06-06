# =============================================================================
# artifacts/api-server/Dockerfile — Fase 6
#
# Build em dois estágios:
#   1. builder — compila TypeScript → CJS com esbuild
#   2. runtime — imagem mínima só com o bundle e deps de produção
# =============================================================================

# -----------------------------------------------------------------------------
# Estágio 1: build
# -----------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app

# Copiar apenas os arquivos de workspace necessários (sem o monorepo inteiro)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./

# Copiar somente os pacotes que o api-server precisa
COPY lib/db/        ./lib/db/
COPY artifacts/api-server/ ./artifacts/api-server/

# Instalar pnpm e dependências do workspace
RUN npm install -g pnpm@10 --silent && \
    pnpm install --frozen-lockfile --silent

# Compilar TypeScript → bundle CJS (Fase 6: esbuild, sem source maps em prod)
ENV NODE_ENV=production
RUN pnpm --filter @workspace/api-server run build

# -----------------------------------------------------------------------------
# Estágio 2: runtime mínimo — ISO 27001 A.8.2 (superfície de ataque mínima)
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

# Fase 6: usuário sem privilégios (não rodar como root)
RUN addgroup -S carometro && adduser -S carometro -G carometro

# Copiar apenas o bundle final
COPY --from=builder /app/artifacts/api-server/dist/ ./dist/

# Instalar dependências de produção (sem devDependencies)
COPY artifacts/api-server/package.json ./
RUN npm install --omit=dev --silent

USER carometro

EXPOSE 8080

# Fase 6: healthcheck — usado pelo nginx depends_on e load balancers
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "dist/server.cjs"]
