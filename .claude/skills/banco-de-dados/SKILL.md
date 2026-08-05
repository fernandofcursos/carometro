# Skill: Banco de Dados — Ciclo de Vida e Persistência

## Visão geral

O banco PostgreSQL 16 roda **dentro do container de desenvolvimento** (`carometro-dev`).
O entrypoint (`entrypoint.sh`) gerencia todo o ciclo de vida automaticamente:

```
Container start
  │
  ├─ PGDATA vazio?  →  inicializar cluster (pg_createcluster)
  │
  ├─ Iniciar PostgreSQL (pg_ctlcluster 16 main start)
  │
  ├─ Criar role/banco carometro + extensões (idempotente)
  │
  ├─ Hash do schema mudou?  →  drizzle-kit push  →  salvar novo hash
  │
  └─ Primeira vez?  →  seed-admin  →  gravar marcador de init
```

## Persistência

| O que persiste | Onde |
|---|---|
| Dados do banco (tabelas, linhas) | Volume Docker `carometro-pg-dev` → `/var/lib/postgresql/16/main` |
| Hash do schema | `$PGDATA/.seshat_schema_hash` |
| Marcador de primeira init | `$PGDATA/.seshat_initialized` |
| Config PG (pg_hba, postgresql.conf) | Imagem Docker (`/etc/postgresql/16/main/`) |

## Regras de operação

- **Cluster**: inicializado **uma única vez** na primeira montagem do volume vazio.
- **Schema**: `drizzle-kit push` roda automaticamente **somente quando** os arquivos
  `lib/db/src/**/*.ts` têm hash diferente do armazenado. Nunca roda sem motivo.
- **Seed-admin**: executado **apenas na primeira inicialização** (marcador `$PGDATA/.seshat_initialized`).
  É idempotente — se o marcador for removido ou o banco for recriado, recria o admin.
- **Banco externo**: se `DATABASE_URL` não apontar para `localhost`/`127.0.0.1`,
  nenhuma das etapas acima roda (PG externo como Neon).

## Comandos do entrypoint

```bash
# Abrir shell interativo (padrão)
docker compose run --rm dev shell

# Aplicar schema manualmente (force)
docker compose run --rm dev db:push

# Recriar/verificar administrador
docker compose run --rm dev db:seed

# Forçar re-setup completo (remove marcadores)
docker compose run --rm dev db:hash-reset
# → reinicie o container após este comando

# Equivalente direto via pnpm
pnpm --filter @workspace/db run push-force
pnpm --filter @workspace/api-server run seed-admin
```

## Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `entrypoint.sh` | Orquestra todo o ciclo de vida do banco |
| `Dockerfile` | Instala PG 16, pré-cria config, NÃO inicializa dados |
| `docker-compose.yml` | Define volume `pg_data_dev`, healthcheck PG |
| `lib/db/drizzle.config.ts` | Configuração do Drizzle ORM |
| `lib/db/src/schema/` | Definições de tabelas (fonte de verdade do schema) |
| `scripts/src/seed-admin.ts` | Seed idempotente do admin + roles padrão |
| `artifacts/api-server/src/scripts/seed-admin.ts` | Idem, com roles adicionais das specs de carômetro |
| `init-db.sql` | Extensões SQL (usado pelo perfil `split` com PG externo) |

## Perfis docker-compose

| Perfil | Banco | Uso |
|---|---|---|
| *(padrão)* | PostgreSQL **interno** ao container `dev` | Desenvolvimento local |
| `split` | PostgreSQL **sidecar** (`carometro-db`, porta 5433) | Mais próximo de produção |
| `https` | Igual ao padrão + nginx TLS | Funcionalidades que exigem HTTPS (câmera) |

## Troubleshooting

### PG não sobe
```bash
# Ver logs do entrypoint
docker compose logs dev

# Tentar iniciar manualmente dentro do container
docker compose exec dev bash
runuser -u postgres -- pg_ctlcluster 16 main start
pg_isready -U carometro -d carometro
```

### Schema desatualizado
```bash
# Forçar reaplicação
docker compose run --rm dev db:push
# Ou remover marcador e reiniciar
docker compose run --rm dev db:hash-reset
docker compose restart dev
```

### Admin perdido / senha desconhecida
```bash
# O seed é idempotente — só cria se não houver usuários
docker compose run --rm dev db:seed
# Ou resetar senha do admin
pnpm --filter @workspace/scripts run reset-admin-password
```

### Volume corrompido / recomeçar do zero
```bash
docker compose down -v          # remove containers E volumes
docker compose up --build       # rebuild + reinicialização limpa
```

## Variáveis de ambiente relevantes

| Variável | Descrição | Padrão dev |
|---|---|---|
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql://carometro:carometro@localhost:5432/carometro` |
| `ENCRYPTION_KEY` | Chave AES-256 (hex 64 chars) para criptografia de fotos/e-mails | Definida em `.env` |
| `SESSION_SECRET` | Segredo JWT/sessão | Definido em `.env` |
| `ADMIN_EMAIL` | E-mail do administrador inicial | `admin@escola.edu.br` |
