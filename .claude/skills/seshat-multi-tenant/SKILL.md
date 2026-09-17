# Skill: Multi-Tenant (RLS)

## Conceito

Arquitetura multi-tenant via Row-Level Security (RLS) do PostgreSQL. Cada escola é um tenant isolado por `escola_id` em todas as tabelas + políticas RLS.

## Tabelas Globais (sem escola_id)

`roles`, `permissoes`, `roles_permissoes`, `escolas`, `turnos`, `requerimento_tipos`, `requerimento_assuntos`

## Tabelas Tenant-Scoped (com escola_id)

Todas as demais: `usuarios`, `estudantes`, `matriculas`, `turmas`, `ocorrencias`, `carteiras`, `cartoes_saida`, `requerimentos`, `ia_*`, etc.

## Middleware

```typescript
// artifacts/api-server/src/middleware/tenant.ts
import { withTenant, withSuperAdmin, requireTenant } from "../middleware/tenant.js";

// Em rotas normais:
router.use(requireAuth, requireTenant);

// Dentro do handler:
await withTenant(req.escolaId!, async (tx) => {
  // queries aqui são isoladas por escola_id via RLS
});
```

## JWT com escolaId

```typescript
// Payload do JWT inclui escolaId
interface JWTPayload {
  sub: string;     // usuarioId
  escolaId: string; // tenant
  iat: number;
  exp: number;
}
```

## Migração

```bash
psql $DATABASE_URL -f scripts/migrate-multi-tenant.sql
```

Executar SOMENTE após todas as implementações estarem completas.

## Escola Padrão

UUID: `00000000-0000-0000-0000-000000000001`
Sigla: `ETSM`

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/escolas.ts` | Schema Drizzle da tabela escolas |
| `artifacts/api-server/src/middleware/tenant.ts` | withTenant() + requireTenant |
| `scripts/migrate-multi-tenant.sql` | DDL completa + RLS |
| `.specs/features/multi-tenant.md` | Spec completa |
