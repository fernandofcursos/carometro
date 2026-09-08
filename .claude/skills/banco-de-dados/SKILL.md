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

### Regras do script de migração SQL

- **Sempre idempotente**: use `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `DROP COLUMN IF EXISTS`, `DROP CONSTRAINT IF EXISTS`.
- **Remoção de coluna com dados**: envolva qualquer `INSERT ... SELECT coluna_removida` em bloco `DO $$ IF EXISTS (information_schema.columns ...) THEN ... END IF $$` para verificar se a coluna ainda existe antes de ler.
- **Verificação final**: use SELECTs separados por tabela (não UNION ALL entre literais e dados) para evitar erros de tipo/arity.
- O script pode ser re-executado sem efeito colateral — NOTICEs são esperados em execuções subsequentes.

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

## Migrations aplicadas manualmente

| Script | O que faz |
|---|---|
| `scripts/migrate-matriculas.sql` | Índice único parcial `uq_matricula_usuario_turma`; coluna `modulo_menor` em cursos |
| `scripts/migrate-turmas.sql` | Coluna `modulo varchar(4)` e constraint `ck_turma_modulo` |
| `scripts/migrate-fotos.sql` | Tabela `fotos`; FK `foto_id` em `estudantes` e `usuarios`; migra bytea inline → tabela |

### migrate-fotos.sql — detalhes

O script é **idempotente** e executa dois estágios em um único `BEGIN/COMMIT`:

1. **Etapa 1** — Cria `fotos` + adiciona `foto_id FK` em estudantes e usuarios (se não existirem)
2. **Etapa 2** — Migra bytea inline (`foto_dados`) → `fotos`; atualiza `foto_id` nos registros migrados

Após verificar que todos os registros têm `foto_id IS NOT NULL`, execute o bloco `DROP COLUMN` comentado no final do script para liberar o espaço do bytea inline.

## Tabela `fotos`

```sql
fotos (
  id               uuid PK,
  entidade_tipo    varchar(20) NOT NULL,  -- 'estudante' | 'usuario'
  entidade_id      uuid NOT NULL,
  mime_type        varchar(20) DEFAULT 'image/jpeg',
  tamanho_bytes    integer NOT NULL,
  iv               char(24) NOT NULL,     -- base64 do IV AES-256-CBC
  hash_integridade char(64) NOT NULL,     -- SHA-256 hex dos bytes originais
  dados            bytea NOT NULL,        -- bytes criptografados AES-256-CBC
  criado_em        timestamptz,
  atualizado_em    timestamptz,
  UNIQUE (entidade_tipo, entidade_id)     -- uma foto por entidade
)
```

`GET /api/fotos/:id` — endpoint canônico; descriptografa e serve com `Cache-Control: private, max-age=86400`.

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

## Criação automática do .env no devcontainer

O `initializeCommand` do devcontainer executa `scripts/criar-env-dev.sh` antes de subir o container.
O script cria o `.env` com os valores corretos de desenvolvimento **somente se o arquivo não existir** — nunca sobrescreve.

`DATABASE_URL` gerado automaticamente: `postgresql://seshat:seshat@localhost:5432/seshat`

Se o `.env` foi sobrescrito acidentalmente com valores do `.env.example` (que aponta para o serviço `db` de produção), corrija:
```bash
# No Mac, antes de reabrir o container:
rm /caminho/do/projeto/.env
# Reabrir o devcontainer — o initializeCommand recria o .env correto
```
