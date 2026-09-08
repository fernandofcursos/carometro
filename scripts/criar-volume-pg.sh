#!/bin/bash
# =============================================================================
# criar-volume-pg.sh — garante que o volume externo do PostgreSQL existe
#
# Deve ser executado UMA VEZ antes do primeiro "docker compose up".
# Volume declarado como external no compose — nunca removido por "down -v".
#
# Uso:
#   bash scripts/criar-volume-pg.sh
# =============================================================================

VOLUME="seshat-pg-dev"

if docker volume inspect "$VOLUME" > /dev/null 2>&1; then
  echo "[pg] Volume '$VOLUME' já existe — nenhuma ação necessária."
else
  docker volume create "$VOLUME"
  echo "[pg] Volume '$VOLUME' criado com sucesso."
fi
