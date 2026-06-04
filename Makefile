# =============================================================================
# Makefile — Atalhos para o ambiente de desenvolvimento Carômetro
# =============================================================================

.PHONY: build up down shell logs dev dev-all codegen db-push typecheck seed clean rebuild

# ---------------------------------------------------------------------------
# Gerenciamento do container
# ---------------------------------------------------------------------------

## build: Constrói a imagem Docker
build:
	docker compose build

## up: Sobe o ambiente (frontend + PostgreSQL interno)
up:
	docker compose up

## up-d: Sobe em background (detached)
up-d:
	docker compose up -d

## down: Para e remove os containers (mantém volumes)
down:
	docker compose down

## down-v: Para e remove containers E volumes (apaga dados do banco!)
down-v:
	docker compose down -v

## rebuild: Rebuild completo sem cache
rebuild:
	docker compose build --no-cache && docker compose up

## logs: Exibe logs em tempo real
logs:
	docker compose logs -f dev

# ---------------------------------------------------------------------------
# Comandos de desenvolvimento (executam dentro do container)
# ---------------------------------------------------------------------------

## shell: Abre terminal interativo dentro do container
shell:
	docker compose run --rm dev shell

## dev: Inicia apenas o frontend Vite (igual ao Replit)
dev:
	docker compose run --rm --service-ports dev dev

## dev-all: Inicia frontend + api-server em paralelo
dev-all:
	docker compose run --rm --service-ports dev dev:all

## codegen: Regenera hooks React Query e schemas Zod (Orval)
codegen:
	docker compose run --rm dev codegen

## db-push: Aplica schema Drizzle no banco
db-push:
	docker compose run --rm dev db:push

## typecheck: Verifica tipos TypeScript em todos os pacotes
typecheck:
	docker compose run --rm dev typecheck

## seed: Cria administrador inicial (usa ADMIN_EMAIL do .env)
seed:
	docker compose run --rm dev seed

## seed-email: Cria admin com e-mail específico
## Uso: make seed-email EMAIL=fulano@escola.edu.br
seed-email:
	docker compose run --rm dev seed $(EMAIL)

# ---------------------------------------------------------------------------
# Banco de dados (perfil split — PG como serviço separado)
# ---------------------------------------------------------------------------

## split: Sobe com PostgreSQL como serviço separado
split:
	docker compose --profile split up

## pgadmin: Sobe PostgreSQL + pgAdmin (http://localhost:5050)
pgadmin:
	docker compose --profile split --profile tools up

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

## clean: Remove imagens locais do projeto
clean:
	docker compose down -v
	docker rmi carometro-dev:local 2>/dev/null || true

## ps: Status dos containers
ps:
	docker compose ps

## info: Exibe informações do ambiente
info:
	@echo ""
	@echo "  Carômetro Dev Environment"
	@echo "  ========================="
	@echo ""
	@echo "  Imagem:     carometro-dev:local"
	@echo "  Frontend:   http://localhost:5000"
	@echo "  API:        http://localhost:8080/api/healthz"
	@echo "  PostgreSQL: localhost:5432"
	@echo "  pgAdmin:    http://localhost:5050 (perfil tools)"
	@echo ""
	@docker compose ps 2>/dev/null || echo "  Container não está rodando"
	@echo ""

## help: Lista todos os comandos disponíveis
help:
	@echo ""
	@echo "  Comandos disponíveis:"
	@echo ""
	@grep -E '^## ' Makefile | sed 's/## /  /' | column -t -s ':'
	@echo ""
