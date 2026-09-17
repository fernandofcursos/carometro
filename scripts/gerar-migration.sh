#!/bin/bash
# =============================================================================
# gerar-migration.sh — gera script SQL de migração para as mudanças de schema
#
# Compara o schema Drizzle atual com o banco e gera um arquivo SQL em
# scripts/migrations/ com as instruções ALTER/CREATE necessárias.
#
# Uso (dentro do container):
#   bash scripts/gerar-migration.sh [descricao]
#
# Exemplo:
#   bash scripts/gerar-migration.sh "add-coluna-foto-usuarios"
#
# O arquivo gerado deve ser revisado antes de executar em produção.
# =============================================================================

MIGRATIONS_DIR="/workspace/scripts/migrations"
DESCRICAO="${1:-sem-descricao}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARQUIVO="$MIGRATIONS_DIR/${TIMESTAMP}_${DESCRICAO}.sql"

mkdir -p "$MIGRATIONS_DIR"

echo "[migration] Gerando script: $ARQUIVO"

# Cabeçalho do arquivo
cat > "$ARQUIVO" <<HEADER
-- =============================================================================
-- Migration: ${TIMESTAMP}_${DESCRICAO}
-- Gerado em: $(date '+%Y-%m-%d %H:%M:%S')
--
-- REVISE antes de executar. Aplique com:
--   psql \$DATABASE_URL -f $ARQUIVO
-- =============================================================================

BEGIN;

-- Cole aqui as instruções SQL necessárias
-- (geradas pelo drizzle-kit ou escritas manualmente)

COMMIT;
HEADER

# Tentar gerar o diff do drizzle-kit (pode falhar se deps não instaladas)
if command -v pnpm > /dev/null 2>&1 && [ -d /workspace/node_modules ]; then
  echo "[migration] Executando drizzle-kit generate para capturar diff..."
  DIFF_FILE=$(mktemp)
  (cd /workspace && pnpm --filter @workspace/db exec drizzle-kit generate \
    --config lib/db/drizzle.config.ts 2>"$DIFF_FILE") || true

  # Encontrar o SQL mais recente gerado pelo drizzle-kit
  LATEST_SQL=$(find /workspace/lib/db/drizzle -name "*.sql" -newer "$ARQUIVO" 2>/dev/null | sort -r | head -1)
  if [ -n "$LATEST_SQL" ]; then
    echo "" >> "$ARQUIVO"
    echo "-- === SQL gerado pelo drizzle-kit ===" >> "$ARQUIVO"
    cat "$LATEST_SQL" >> "$ARQUIVO"
    echo "[migration] SQL do drizzle-kit incluído de: $LATEST_SQL"
  else
    echo "-- (drizzle-kit não gerou diff — edite manualmente)" >> "$ARQUIVO"
  fi

  rm -f "$DIFF_FILE"
else
  echo "-- (pnpm/deps não disponíveis — edite manualmente)" >> "$ARQUIVO"
fi

echo ""
echo "[migration] Arquivo criado: $ARQUIVO"
echo "[migration] Revise o conteúdo e execute:"
echo "   psql \$DATABASE_URL -f $ARQUIVO"
echo "   pnpm --filter @workspace/db run push-force"
