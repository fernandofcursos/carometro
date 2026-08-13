# Skill: Banco de Dados — Ciclo de Vida e Persistência

## Visão geral

O banco PostgreSQL 16 roda **dentro do container de desenvolvimento** (`seshat-dev`).
Os dados persistem em um **volume Docker externo** (`seshat-pg-dev`) que **nunca é removido**
por `docker compose down` ou `docker compose down -v`.

```
Container start
  │
  ├─ PGDATA vazio?  →  inicializar cluster (pg_createcluster) — somente 1ª vez
  │
  ├─ Iniciar PostgreSQL (pg_ctlcluster 16 main start)
  │
  ├─ Criar role/banco seshat + extensões (idempotente)
  │
  ├─ Hash do schema mudou?  →  drizzle-kit push  →  salvar novo hash
  │
  └─ Primeira vez?  →  seed-admin  →  gravar marcador de init
```

## Persistência

| O que persiste | Onde |
|---|---|
| Dados do banco (tabelas, linhas) | Volume Docker **externo** `seshat-pg-dev` → `/var/lib/postgresql/16/main` |
| Hash do schema | `$PGDATA/.seshat_schema_hash` |
| Marcador de primeira init | `$PGDATA/.seshat_initialized` |
| Config PG (pg_hba, postgresql.conf) | Imagem Docker (`/etc/postgresql/16/main/`) |

## Regras de operação

- **Cluster**: inicializado **uma única vez** na primeira montagem do volume vazio.
- **Schema**: `drizzle-kit push` roda automaticamente **somente quando** os arquivos
  `lib/db/src/**/*.ts` têm hash diferente do armazenado. Nunca roda sem motivo.
- **Seed-admin**: executado **apenas na primeira inicialização** (marcador `$PGDATA/.seshat_initialized`).
  É idempotente — se o marcador for removido ou o banco for recriado, recria o admin.
- **Volume externo**: `docker compose down -v` **não remove** `seshat-pg-dev`. Os dados sobrevivem.
- **Banco externo**: se `DATABASE_URL` não apontar para `localhost`/`127.0.0.1`,
  nenhuma das etapas acima roda (PG externo como Neon).

## Setup inicial (primeira vez na máquina)

```bash
# 1. Criar o volume externo (apenas uma vez por máquina)
bash scripts/criar-volume-pg.sh

# 2. Subir o container
docker compose up --build
```

## Comandos do dia a dia

```bash
# Aplicar schema após editar lib/db/src/schema/*.ts
docker compose run --rm dev db:push
# ou dentro do container:
pnpm --filter @workspace/db run push-force

# Gerar script SQL de migração antes de push-force (quando há dados a preservar)
docker compose run --rm dev db:migrate "descricao-da-mudanca"
# → cria scripts/migrations/<timestamp>_<descricao>.sql para revisão

# Recriar/verificar administrador
docker compose run --rm dev db:seed

# Forçar re-execução do schema e seed no próximo start
docker compose run --rm dev db:hash-reset

# Recriar banco do zero (DESTRUTIVO — apaga todos os dados)
bash scripts/recriar-banco.sh --confirmar
docker compose up --build
```

## Fluxo correto ao alterar schema

```
1. Editar lib/db/src/schema/*.ts
2. bash scripts/gerar-migration.sh "nome-da-mudanca"   ← gera SQL em scripts/migrations/
3. Revisar o SQL gerado
4. psql $DATABASE_URL -f scripts/migrations/<arquivo>.sql  ← aplica sem perder dados
5. pnpm --filter @workspace/db run push-force              ← sincroniza drizzle
```
> Para bancos vazios (sem dados), pode pular os passos 2-4 e ir direto ao push-force.

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `entrypoint.sh` | Orquestra todo o ciclo de vida do banco |
| `Dockerfile` | Instala PG 16, pré-cria config, NÃO inicializa dados |
| `docker-compose.yml` | Volume `pg_data_dev` declarado como **external** |
| `scripts/criar-volume-pg.sh` | Cria o volume externo (rodar 1x por máquina) |
| `scripts/recriar-banco.sh` | Destrói e recria o banco (DESTRUTIVO) |
| `scripts/gerar-migration.sh` | Gera script SQL de migração |
| `scripts/migrations/` | Scripts SQL gerados por mudança de schema |
| `lib/db/drizzle.config.ts` | Configuração do Drizzle ORM |
| `lib/db/src/schema/` | Definições de tabelas (fonte de verdade do schema) |
| `scripts/src/seed-admin.ts` | Seed idempotente do admin + roles padrão |

## Perfis docker-compose

| Perfil | Banco | Uso |
|---|---|---|
| *(padrão)* | PostgreSQL **interno** ao container `dev` | Desenvolvimento local |
| `split` | PostgreSQL **sidecar** (`seshat-db`, porta 5433) | Mais próximo de produção |
| `https` | Igual ao padrão + nginx TLS | Funcionalidades que exigem HTTPS (câmera) |

## Troubleshooting

### Volume externo não existe (erro ao subir)
```bash
bash scripts/criar-volume-pg.sh
docker compose up --build
```

### PG não sobe
```bash
docker compose logs dev
docker compose exec dev bash
runuser -u postgres -- pg_ctlcluster 16 main start
pg_isready -U seshat -d seshat
```

### Schema desatualizado / push-force sem dados
```bash
docker compose run --rm dev db:push
```

### Schema com dados existentes a preservar
```bash
docker compose run --rm dev db:migrate "descricao"
# revisar scripts/migrations/<arquivo>.sql
psql $DATABASE_URL -f scripts/migrations/<arquivo>.sql
docker compose run --rm dev db:push
```

### Admin perdido / senha desconhecida
```bash
docker compose run --rm dev db:seed
```

### Recriar banco do zero
```bash
bash scripts/recriar-banco.sh --confirmar
docker compose up --build
```

## Variáveis de ambiente relevantes

| Variável | Descrição | Padrão dev |
|---|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql://seshat:seshat@localhost:5432/seshat` |
| `ENCRYPTION_KEY` | Chave AES-256 (hex 64 chars) para criptografia de fotos/e-mails | Definida em `.env` |
| `SESSION_SECRET` | Segredo JWT/sessão | Definido em `.env` |
| `ADMIN_EMAIL` | E-mail do administrador inicial | `admin@escola.edu.br` |
