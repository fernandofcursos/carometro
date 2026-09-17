#!/bin/bash
# =============================================================================
# recriar-banco.sh — destrói e recria o banco do zero (use com cautela)
#
# Remove o volume de dados do PostgreSQL e o recria vazio.
# Na próxima inicialização do container, o banco será recriado e o
# seed-admin executado automaticamente.
#
# Uso:
#   bash scripts/recriar-banco.sh [--confirmar]
# =============================================================================

VOLUME="seshat-pg-dev"

if [ "$1" != "--confirmar" ]; then
  echo "⚠️  ATENÇÃO: Este comando apaga TODOS os dados do banco PostgreSQL."
  echo "   Para confirmar, execute:"
  echo ""
  echo "   bash scripts/recriar-banco.sh --confirmar"
  echo ""
  exit 1
fi

echo "[pg] Parando containers..."
docker compose stop dev 2>/dev/null || true

echo "[pg] Removendo volume '$VOLUME'..."
docker volume rm "$VOLUME" 2>/dev/null || {
  echo "[pg] ERRO: Volume em uso. Pare todos os containers primeiro:"
  echo "   docker compose down"
  exit 1
}

echo "[pg] Recriando volume vazio..."
docker volume create "$VOLUME"

echo ""
echo "[pg] Pronto. Inicie o container normalmente:"
echo "   docker compose up --build"
echo "   (o banco será recriado e o seed-admin executado automaticamente)"
