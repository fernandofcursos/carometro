#!/bin/bash
# =============================================================================
# scripts/recriacao-volumes.sh
# Migração dos volumes Docker: carometro-* → seshat-*
#
# Uso:
#   bash scripts/recriacao-volumes.sh          # migra dados + renomeia
#   bash scripts/recriacao-volumes.sh --fresh  # descarta dados, começa do zero
# =============================================================================

set -euo pipefail

BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

FRESH=false
[[ "${1:-}" == "--fresh" ]] && FRESH=true

OLD_VOLUMES=(carometro-pg-dev carometro-pg-split carometro-pnpm-store carometro-pgadmin)
NEW_VOLUMES=(seshat-pg-dev    seshat-pg-split    seshat-pnpm-store    seshat-pgadmin)
OLD_IMAGES=(carometro-dev:local)
OLD_CONTAINERS=(carometro-dev carometro-nginx carometro-db carometro-pgadmin)

echo -e "${BOLD}Seshat — Recriação de volumes Docker${NC}"
echo -e "${CYAN}Modo: $([ "$FRESH" = true ] && echo "início limpo (--fresh)" || echo "migração de dados")${NC}"
echo ""

# ── 1. Parar e remover containers antigos ────────────────────────────────────
echo -e "${CYAN}[1/5] Parando containers...${NC}"
docker compose down 2>/dev/null || true
for c in "${OLD_CONTAINERS[@]}"; do
  docker rm -f "$c" 2>/dev/null || true
done

# ── 2. Backup dos dados PG (sempre, exceto em --fresh) ───────────────────────
if [ "$FRESH" = false ]; then
  BACKUP_DIR="$(pwd)/backup/volumes"
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/pg-backup-$(date +%Y%m%d-%H%M%S).tar.gz"

  if docker volume inspect carometro-pg-dev &>/dev/null; then
    echo -e "${CYAN}[2/5] Fazendo backup de carometro-pg-dev → $BACKUP_FILE${NC}"
    docker run --rm \
      -v carometro-pg-dev:/pgdata:ro \
      -v "$BACKUP_DIR":/backup \
      alpine tar czf "/backup/$(basename "$BACKUP_FILE")" -C /pgdata . \
      && echo -e "${GREEN}    Backup criado: $BACKUP_FILE${NC}" \
      || echo -e "${YELLOW}    AVISO: backup falhou — continuando mesmo assim${NC}"
  else
    echo -e "${YELLOW}[2/5] Volume carometro-pg-dev não existe — nada para fazer backup${NC}"
  fi
else
  echo -e "${YELLOW}[2/5] Modo --fresh: backup pulado${NC}"
fi

# ── 3. Criar novos volumes e migrar dados ────────────────────────────────────
echo -e "${CYAN}[3/5] Criando volumes seshat-* e migrando dados...${NC}"

for i in "${!OLD_VOLUMES[@]}"; do
  OLD="${OLD_VOLUMES[$i]}"
  NEW="${NEW_VOLUMES[$i]}"

  # Criar novo volume (se não existir)
  docker volume create "$NEW" &>/dev/null

  if [ "$FRESH" = true ]; then
    echo -e "    ${YELLOW}$NEW criado (vazio — modo fresh)${NC}"
    continue
  fi

  if docker volume inspect "$OLD" &>/dev/null; then
    echo -e "    Copiando $OLD → $NEW..."
    docker run --rm \
      -v "${OLD}":/from:ro \
      -v "${NEW}":/to \
      alpine sh -c "cd /from && cp -a . /to/" \
      && echo -e "    ${GREEN}✓ $NEW${NC}" \
      || echo -e "    ${YELLOW}⚠ $NEW — falha na cópia, volume criado vazio${NC}"
  else
    echo -e "    ${YELLOW}$OLD não existe — $NEW criado vazio${NC}"
  fi
done

# ── 4. Remover volumes e imagens antigas ─────────────────────────────────────
echo -e "${CYAN}[4/5] Removendo volumes e imagens antigas...${NC}"

for v in "${OLD_VOLUMES[@]}"; do
  if docker volume inspect "$v" &>/dev/null; then
    docker volume rm "$v" 2>/dev/null \
      && echo -e "    ${GREEN}✓ volume $v removido${NC}" \
      || echo -e "    ${YELLOW}⚠ $v — em uso, não removido${NC}"
  fi
done

for img in "${OLD_IMAGES[@]}"; do
  docker rmi "$img" 2>/dev/null \
    && echo -e "    ${GREEN}✓ imagem $img removida${NC}" \
    || true
done

# ── 5. Rebuild e start ───────────────────────────────────────────────────────
echo -e "${CYAN}[5/5] Rebuild e inicialização do Seshat...${NC}"
docker compose up --build -d

echo ""
echo -e "${GREEN}${BOLD}✓ Migração concluída.${NC}"
echo ""
echo -e "${CYAN}Logs:${NC}"
echo -e "  docker compose logs -f dev"
echo ""
echo -e "${CYAN}Shell interativo:${NC}"
echo -e "  docker compose exec dev bash"
echo ""

if [ "$FRESH" = false ] && [ -f "$BACKUP_FILE" ]; then
  echo -e "${YELLOW}Backup salvo em: $BACKUP_FILE${NC}"
  echo -e "Para restaurar: docker run --rm -v seshat-pg-dev:/pgdata -v \$(pwd)/backup/volumes:/backup alpine tar xzf /backup/$(basename "$BACKUP_FILE") -C /pgdata"
fi
