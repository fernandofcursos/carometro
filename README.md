# Carômetro — Ambiente de Desenvolvimento Docker

Container Docker que replica o ambiente Replit para desenvolvimento local do projeto Carômetro.

## O que está incluído

| Componente | Versão | Mesmo do Replit? |
|---|---|---|
| Node.js | 20 (Debian Bookworm slim) | ✅ `modules = ["nodejs-20"]` |
| pnpm | 10.x | ✅ `"pnpm": "^10.34.1"` |
| lockfileVersion | 9.0 | ✅ |
| PostgreSQL | 16 (local no container) | ✅ mesma versão (Neon usa PG 16) |
| esbuild | linux-x64 apenas | ✅ overrides do pnpm-workspace.yaml |
| Plugins Replit | **Desativados** (`REPL_ID=""`) | N/A — só funcionam no Replit |
| git | 2.x | ➕ extra |
| openssl | 3.x | ➕ extra |

## Estrutura dos arquivos

```
replit-dev/
├── Dockerfile           # imagem Node 20 + PostgreSQL 16 + ferramentas
├── docker-compose.yml   # orquestração do container dev
├── entrypoint.sh        # inicialização: PG + pnpm install + db push + dev
├── init-db.sql          # extensões do PostgreSQL (uuid-ossp, pgcrypto, unaccent)
├── pgadmin-servers.json # configuração automática do pgAdmin
├── .env.dev             # variáveis de exemplo (copie para .env)
├── .dockerignore        # exclui node_modules e .git do build
├── Makefile             # atalhos para os comandos mais usados
└── README.md            # este arquivo
```

## Pré-requisitos

- Docker Desktop 4.x+ (ou Docker Engine 24+ no Linux)
- Mínimo 4GB de RAM disponível para o container
- Porta 5000, 8080 e 5432 livres na máquina host

## Setup rápido

```bash
# 1. Clonar o repositório
git clone https://github.com/fernandofcursos/carometro.git
cd carometro

# 2. Copiar os arquivos deste diretório para dentro do repositório
#    (ou colocar este diretório ao lado do repositório e ajustar o volume)
cp -r replit-dev/* .

# 3. Copiar e revisar variáveis de ambiente
cp .env.dev .env
# Edite .env se quiser mudar DATABASE_URL, SESSION_SECRET etc.

# 4. Construir a imagem (primeira vez: ~3 minutos)
make build
# ou: docker compose build

# 5. Subir o ambiente
make up
# ou: docker compose up

# 6. Acessar o app
# http://localhost:5000
```

O entrypoint faz automaticamente na primeira vez:
1. Inicia o PostgreSQL 16 interno
2. Cria o banco e usuário `carometro`
3. Roda `pnpm install` (usa o cache do volume pnpm_store)
4. Aplica o schema com `pnpm --filter @workspace/db run push`
5. Cria o administrador inicial se o banco estiver vazio
6. Inicia o Vite dev server na porta 5000

## Comandos do dia a dia

```bash
make up            # sobe tudo
make down          # para os containers
make shell         # abre bash dentro do container
make logs          # acompanha logs em tempo real
make codegen       # regenera hooks Orval após mudar openapi.yaml
make db-push       # aplica schema após mudar lib/db/src/schema/
make typecheck     # verifica tipos em todos os pacotes
make seed          # cria admin (usa ADMIN_EMAIL do .env)
make rebuild       # rebuild completo sem cache
make help          # lista todos os comandos
```

## Usar o banco externo (Neon — idêntico ao Replit)

Edite o `.env` e substitua `DATABASE_URL`:

```env
DATABASE_URL=postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/carometro?sslmode=require
```

O entrypoint detecta que não é `localhost` e pula a inicialização do PostgreSQL local.

## Perfis do docker-compose

```bash
# PostgreSQL como serviço separado (mais próximo de produção)
docker compose --profile split up

# PostgreSQL separado + pgAdmin visual (http://localhost:5050)
docker compose --profile split --profile tools up
```

Credenciais do pgAdmin: `admin@carometro.local` / `admin`

## Diferenças em relação ao Replit

| Comportamento | Replit | Este container |
|---|---|---|
| Banco de dados | Neon cloud (externo) | PostgreSQL 16 local (interno) |
| Plugins Vite | `cartographer`, `devBanner` ativos | Desativados (`REPL_ID=""`) |
| Porta externa | 80 (remapeada pelo Replit) | 5000 (direta) |
| HTTPS | Automático pelo Replit | HTTP (adicione nginx para HTTPS) |
| Hot reload | Via websocket do Replit | Via websocket do Vite (funciona igual) |

## Solução de problemas

**`pnpm install` falha com erro de `minimumReleaseAge`:**
O `pnpm-workspace.yaml` exige pacotes com 1+ dia de publicação. Se um pacote novo falhar, adicione-o em `minimumReleaseAgeExclude` no `pnpm-workspace.yaml`.

**PostgreSQL não inicia:**
```bash
make shell
# dentro do container:
sudo -u postgres pg_ctlcluster 16 main status
sudo -u postgres pg_ctlcluster 16 main start
```

**TypeScript `TS server` travado:**
No VSCode: `Ctrl+Shift+P` → `TypeScript: Restart TS Server`

**Limpar tudo e começar do zero:**
```bash
make clean       # remove container + volumes + imagem
make build       # reconstrói
make up          # sobe novamente
```
