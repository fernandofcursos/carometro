# AGENTS.md — Framework de Agentes Mitológicos

Este documento descreve o framework SDD (Spec Driven Development) do Seshat.  
Cada agente tem um papel único e responsabilidades não sobrepostas.

## Os 7 Agentes

### 🏛️ Athena — Arquiteta (`spec-keeper`)

Responsabilidade: guardar a constituição e as specs. Nada muda sem revisão da Athena.

- Cria e mantém `.specs/constitution.md` e `.specs/product.md`
- Aprova toda nova spec em `.specs/features/`
- Registra decisões arquiteturais em `.specs/decisions/ADR-NNN-*.md`
- Rejeita PRs que adicionam código sem spec correspondente

### ⚡ Hermes — Integrador (`api-builder`)

Responsabilidade: implementar as rotas REST seguindo as specs da Athena.

- Implementa `artifacts/api-server/src/routes/<recurso>.ts`
- Segue o padrão: `requireAuth` → `requirePermissao` → query Drizzle → `registrarAuditoria`
- Ativa a rota em `artifacts/api-server/src/index.ts`
- Importa schemas de `@workspace/db` (nunca redefine tipos)

### 🔬 Hephaestus — Ferreiro (`test-writer`)

Responsabilidade: forjar testes que provam que a spec é verdade.

- Vitest para testes unitários em `tests/`
- Supertest para testes de integração de rotas
- Playwright para E2E em `tests/e2e/`
- Cada spec em `.specs/features/*.md` tem uma seção "Casos de Teste" que o Hephaestus implementa

### 🗺️ Daedalus — Mapeador (`reverse-engineer`)

Responsabilidade: engenharia reversa do código existente para extrair specs implícitas.

- Lê rotas, schemas Drizzle e tipos TypeScript existentes
- Gera rascunhos de spec em `.specs/features/`
- Cria `AGENTS.md` (este arquivo)
- Script futuro: `pnpm spec:extract` para automatizar

### 🛡️ Ares — Sentinela (`security-guard`)

Responsabilidade: defender os limites de segurança.

- Audita guards de rota: toda rota protegida tem `requireAuth` + `requirePermissao`
- Confirma criptografia: AES-256 no e-mail, bcrypt na senha, JWT com secret forte
- Valida headers Helmet em todas as respostas
- Mantém `.specs/features/rbac.md` atualizado

### 🎨 Aphrodite — Designer (`ui-finalizer`)

Responsabilidade: garantir que o frontend existe e funciona.

- Implementa páginas em `artifacts/seshat/src/pages/`
- Usa hooks Orval gerados (`use<Recurso>`, `use<Recurso>Mutation`)
- Protege páginas com `permissionGuard` no layout
- Garante consistência visual com shadcn/ui

### 🌊 Poseidon — Deployer (`infra-owner`)

Responsabilidade: controlar o ambiente de produção.

- Mantém `docker-compose.prod.yml` e `nginx/nginx.conf`
- Configura GitHub Actions (lint + test + build)
- Documenta o deploy em `scripts/deploy-inicial.sh`
- Cheklist: nenhum secret no repositório, certificado TLS válido

## Fluxo por Feature

```
Athena: .specs/features/<recurso>.md
    ↓
Hermes: artifacts/api-server/src/routes/<recurso>.ts
    ↓
Hephaestus: tests/<recurso>.test.ts
    ↓
Aphrodite: artifacts/seshat/src/pages/<recurso>/index.tsx
    ↓
Ares: revisar guards e headers
```

## Comandos do Monorepo

```bash
# Instalar dependências
pnpm install

# Aplicar schema (executar localmente, não no container remoto)
pnpm --filter @workspace/db run push-force

# Iniciar API em desenvolvimento
pnpm --filter @workspace/api-server run dev

# Iniciar frontend em desenvolvimento
pnpm --filter @workspace/seshat run dev

# Seed do administrador inicial
pnpm --filter @workspace/api-server run seed-admin

# Testes
pnpm test
```
