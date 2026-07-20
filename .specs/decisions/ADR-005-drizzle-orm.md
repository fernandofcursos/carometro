# ADR-005: Drizzle ORM

**Status:** Aceito  
**Data:** 2025

## Contexto

Precisávamos de um ORM TypeScript que gerasse tipos precisos a partir do schema, suportasse PostgreSQL com Neon (pool de conexões) e tivesse migrações declarativas.

## Decisão

Usar [Drizzle ORM](https://orm.drizzle.team) com `drizzle-kit` para schema management.

## Comandos críticos

```bash
# Aplicar schema sem migration files (development)
pnpm --filter @workspace/db run push-force
# = drizzle-kit push --force

# Nunca usar em produção com dados — usa migration files:
# pnpm --filter @workspace/db run migrate
```

## `@workspace/db` exports

O pacote `lib/db` re-exporta tudo que as rotas precisam:
```typescript
export { db } from "./index";           // instância Drizzle
export * from "./schema";              // todos os tables + insert schemas
export { eq, and, or, isNull, desc, asc, ... } from "drizzle-orm"; // operadores
```

Rotas importam de um único lugar: `import { db, turnosTable, eq } from "@workspace/db"`.

## Consequências

**Positivo:**
- Tipos TypeScript 100% inferidos do schema (sem geração de código extra)
- `drizzle-zod` gera schemas Zod automaticamente via `createInsertSchema`
- `push --force` é rápido para dev (sem arquivos de migração)

**Negativo:**
- `push --force` pode truncar tabelas para resolver conflitos — **nunca usar em produção com dados reais**
- Relações explícitas (`.references()`) validadas no schema mas FK constraints aplicados no banco
