# ADR-001: Monorepo com pnpm Workspaces

**Status:** Aceito  
**Data:** 2025

## Contexto

O Seshat tem três camadas distintas: banco de dados (schemas Drizzle), API (Express) e frontend (React). Precisávamos de uma estrutura que permitisse compartilhar tipos TypeScript entre camadas sem duplicação.

## Decisão

Usar pnpm workspaces com a seguinte estrutura:
- `lib/db/` — schemas Drizzle, migrações, tipos compartilhados (`@workspace/db`)
- `artifacts/api-server/` — Express + rotas (`@workspace/api-server`)
- `artifacts/seshat/` — React + Vite (`@workspace/seshat`)
- `scripts/` — scripts de seed e utilitários

## Consequências

**Positivo:**
- Tipos TypeScript compartilhados sem duplicação (ex: `Turno`, `Curso` usados na API e no frontend via Orval)
- `pnpm --filter @workspace/db run push-force` aplica schema sem sair do monorepo
- Uma única instalação de dependências com deduplicação

**Negativo:**
- `package-import-method=copy` obrigatório no `.npmrc` para evitar erro -116 em macOS com Docker bind-mounts (reflinks não suportados)
- Build order deve respeitar dependências: db → api-server, db → carometro

## `.npmrc` crítico

```
package-import-method=copy
```

Sem isso, o Docker no macOS falha com `ENOTSUP: operation not supported on socket, copyfile`.
