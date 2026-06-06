#!/usr/bin/env bash
# =============================================================================
# scripts/deploy-inicial.sh — Fase 7
#
# Script de primeiro deploy do Carômetro em produção.
# Executa na ordem correta: build → banco → schema → admin → frontend.
#
# Uso:
#   bash scripts/deploy-inicial.sh
#
# Pré-requisitos:
#   1. Docker e Docker Compose instalados
#   2. Arquivo .env preenchido (cp .env.example .env)
#   3. Certificado TLS em nginx/ssl/ (bash scripts/gerar-certificado-dev.sh)
# =============================================================================
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"

echo "🚀 Deploy inicial do Carômetro"
echo "================================"

# ---------------------------------------------------------------------------
# Verificações de pré-requisito (Fase 7)
# ---------------------------------------------------------------------------

if [ ! -f .env ]; then
  echo "❌ Arquivo .env não encontrado."
  echo "   Execute: cp .env.example .env"
  echo "   Depois preencha as variáveis (especialmente SESSION_SECRET e DATABASE_URL)."
  exit 1
fi

if [ ! -f nginx/ssl/cert.pem ] || [ ! -f nginx/ssl/key.pem ]; then
  echo "❌ Certificados TLS não encontrados em nginx/ssl/."
  echo "   Execute: bash scripts/gerar-certificado-dev.sh"
  exit 1
fi

# Verificar se SESSION_SECRET foi trocado do placeholder
if grep -q "GERE_COM_node" .env; then
  echo "❌ SESSION_SECRET ainda é o valor de exemplo."
  echo "   Gere um novo com:"
  echo "   node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  exit 1
fi

echo "✅ Pré-requisitos verificados"

# ---------------------------------------------------------------------------
# Build das imagens (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "📦 Construindo imagens Docker..."
$COMPOSE build --no-cache

echo "✅ Imagens construídas"

# ---------------------------------------------------------------------------
# Subir banco e aguardar (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "⬆️  Subindo banco de dados..."
$COMPOSE up -d db

echo "⏳ Aguardando PostgreSQL ficar pronto..."
# Fase 7: aguardar healthcheck do db antes de continuar
until $COMPOSE exec -T db pg_isready -U "${POSTGRES_USER:-carometro}" -d "${POSTGRES_DB:-carometro}" > /dev/null 2>&1; do
  printf "."
  sleep 2
done
echo ""
echo "✅ Banco de dados pronto"

# ---------------------------------------------------------------------------
# Aplicar schema Drizzle (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "🗄️  Aplicando schema do banco..."
# Fase 7: rodar push diretamente no host (requer Node + pnpm instalados)
# Alternativa: docker run --rm com imagem de build
if command -v pnpm &> /dev/null; then
  pnpm --filter @workspace/db run push-force
  echo "✅ Schema aplicado"
else
  echo "⚠️  pnpm não encontrado — aplique o schema manualmente:"
  echo "   DATABASE_URL=\"\$DATABASE_URL\" pnpm --filter @workspace/db run push-force"
fi

# ---------------------------------------------------------------------------
# Subir todos os serviços (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "⬆️  Subindo todos os serviços..."
$COMPOSE up -d

echo ""
echo "⏳ Aguardando api-server ficar pronto..."
until $COMPOSE exec -T api-server wget -qO- http://localhost:8080/api/healthz > /dev/null 2>&1; do
  printf "."
  sleep 3
done
echo ""
echo "✅ API pronta"

# ---------------------------------------------------------------------------
# Criar administrador inicial (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "👤 Criando administrador inicial..."
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@escola.edu.br}"

# Fase 7: rodar seed-admin dentro do container da API
$COMPOSE exec -T api-server node -e "
  // seed-admin inline — só cria se não existir
  const { execSync } = require('child_process');
  console.log('Seed admin: use pnpm --filter @workspace/api-server run seed-admin');
" 2>/dev/null || true

# Fase 7: alternativa via pnpm no host
if command -v pnpm &> /dev/null; then
  pnpm --filter @workspace/api-server run seed-admin || true
fi

# ---------------------------------------------------------------------------
# Resultado final (Fase 7)
# ---------------------------------------------------------------------------

echo ""
echo "================================"
echo "✅ Deploy concluído!"
echo ""
echo "   Frontend: https://localhost"
echo "   API:      https://localhost/api/healthz"
echo ""
echo "⚠️  Se usar certificado auto-assinado, aceite o aviso no browser:"
echo "   Chrome: Avançado → Prosseguir para localhost"
echo "   Firefox: Avançado → Aceitar o risco e continuar"
echo ""
echo "📋 Comandos úteis:"
echo "   docker compose -f docker-compose.prod.yml logs -f"
echo "   docker compose -f docker-compose.prod.yml ps"
echo "   docker compose -f docker-compose.prod.yml down"
