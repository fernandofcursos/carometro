---
description: Spec do carômetro de Apoio e Operacional
---

# Apoio e Operacional

## Spec

Retorna os membros da equipe de apoio e operacional da instituição. Os dados são exibidos em formato de carômetro (grade de fotos com nome). O agrupamento é feito inteiramente no cliente — o endpoint retorna uma lista plana.

## Endpoint

`GET /api/carometro/apoio-operacional`

## Response Shape

Array plano de `UsuarioCardAPI` (mesmo shape dos demais carômetros de grupo):

```typescript
type UsuarioCardAPI = {
  id: string;           // UUID
  nome: string | null;
  fotoUrl: string | null;
  roles: Array<{ id: string; nome: string }>;
};

// Resposta: UsuarioCardAPI[]
```

## Implementação no Servidor

```typescript
// Roles incluídas
const ROLES = ["inspetor", "limpeza", "portaria", "merendeira", "seguranca"];

// Usa getUsuariosPorRoles — mesma função dos demais carômetros de grupo
const membros = await getUsuariosPorRoles(ROLES, escolaId);
res.json(membros); // array plano
```

## Agrupamento (cliente)

O agrupamento por cargo/role é feito no frontend via `buildGroups()` em `seshat-grupo.tsx`, exatamente como nos outros carômetros de grupo.

## Regras de Negócio

- Roles incluídas: `inspetor`, `limpeza`, `portaria`, `merendeira`, `seguranca`
- Apenas usuários ativos devem ser retornados
- Exibe nome e foto

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
