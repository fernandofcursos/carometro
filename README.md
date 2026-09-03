# Seshat — Ambiente de Desenvolvimento Docker

Container Docker para desenvolvimento local da plataforma **Seshat** — sistema de gestão educacional com registro fotográfico, equipes, turmas e ocorrências.

## O que está incluído

| Componente | Versão | Disponível |
|---|---|---|
| Node.js | 20 (Debian Bookworm slim) | ✅ `modules = ["nodejs-20"]` |
| pnpm | 10.x | ✅ `"pnpm": "^10.34.1"` |
| lockfileVersion | 9.0 |
| PostgreSQL | 16 (local no container) | ✅ mesma versão (Neon usa PG 16) |
| esbuild | linux-x64 apenas | ✅ overrides do pnpm-workspace.yaml |
| Plugins Replit | **Desativados** (`| git | 2.x | ➕ extra |
| openssl | 3.x | ➕ extra |

## Estrutura dos arquivos

```
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
cp -r 
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
2. Cria o banco e usuário `seshat`
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

## Usar o banco externo (Neon — banco externo (Neon))

Edite o `.env` e substitua `DATABASE_URL`:

```env
DATABASE_URL=postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/seshat?sslmode=require
```

O entrypoint detecta que não é `localhost` e pula a inicialização do PostgreSQL local.

## Perfis do docker-compose

```bash
# PostgreSQL como serviço separado (mais próximo de produção)
docker compose --profile split up

# PostgreSQL separado + pgAdmin visual (http://localhost:5050)
docker compose --profile split --profile tools up
```

Credenciais do pgAdmin: `admin@seshat.local` / `admin`

## Monitoramento — Prometheus + Grafana

```bash
# Sobe Prometheus + Grafana
docker compose --profile monitoring up -d

# Grafana:    http://localhost:3001   (admin / seshat-dev)
# Prometheus: http://localhost:9090   (sem auth em dev)
```

Métricas coletadas: requisições HTTP (total, duração p95, in-flight), Node.js heap, PostgreSQL stats.  
Labels sem PII — `normalizeRoute()` remove query strings e UUIDs antes de criar labels.

## Automação e Integração — n8n + Slack

```bash
# Sobe n8n (junto com pgAdmin)
docker compose --profile tools up -d n8n

# n8n: http://localhost:5678
# (criar conta de owner na primeira abertura)
```

n8n conecta o Seshat ao Slack, Gmail, Google Sheets e qualquer API REST sem código adicional.  
Integração Slack via Incoming Webhook ou Bot Token — configurado na UI do n8n.

Tudo junto:
```bash
docker compose --profile monitoring --profile tools up -d
```

## 