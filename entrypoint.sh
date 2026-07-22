#!/bin/bash
# =============================================================================
# entrypoint.sh — ambiente de desenvolvimento Carômetro
# Inicialização MANUAL — nenhum serviço sobe automaticamente.
# =============================================================================

BOLD='\033[1m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

ulimit -n 65536 2>/dev/null || true

CMD_ARG="${1:-shell}"

# Comandos utilitários (usados pelo docker compose run --rm dev <cmd>)
case "$CMD_ARG" in
  shell)
    echo -e "${BOLD}Carômetro Dev — shell interativo${NC}"
    echo -e "${CYAN}Comandos disponíveis:${NC}"
    echo -e "  ${YELLOW}pnpm install${NC}                                   instalar dependências"
    echo -e "  ${YELLOW}pnpm --filter @workspace/db run push-force${NC}     aplicar schema"
    echo -e "  ${YELLOW}pnpm --filter @workspace/api-server run seed-admin${NC} criar admin"
    echo -e "  ${YELLOW}PORT=8080 pnpm --filter @workspace/api-server run dev${NC}  subir API"
    echo -e "  ${YELLOW}pnpm --filter @workspace/carometro run dev${NC}     subir frontend"
    echo ""
    exec /bin/bash
    ;;

  typecheck)
    exec pnpm run typecheck
    ;;

  codegen)
    exec pnpm --filter @workspace/api-spec run codegen
    ;;

  db:push)
    exec pnpm --filter @workspace/db run push-force
    ;;

  seed)
    EMAIL="${2:-admin@escola.edu.br}"
    exec pnpm --filter @workspace/api-server run seed-admin "$EMAIL"
    ;;

  *)
    exec "$@"
    ;;
esac
