---
description: Spec do carômetro de Equipe Gestora
---

# Equipe Gestora

## Conceito

Carômetro da equipe gestora da instituição. Exibe grade fotográfica agrupada por turno → curso, usando o mesmo componente e padrão de API de todos os carômetros de grupo.

## Endpoint

`GET /api/carometro/equipe-gestora`

**Permissão:** `carometro:view` (+ `requireAuth`)

**Implementação:** `getUsuariosPorRoles(["equipe_gestora"])` — retorna **array plano** `UsuarioCardAPI[]`.

## Response Shape

```typescript
// Array plano — agrupamento feito no frontend
UsuarioCardAPI[]

interface UsuarioCardAPI {
  id: string;
  nome: string | null;
  email: string;
  fotoUrl: string | null;  // /api/fotos/:fotoId | /api/usuarios/:id/foto | null
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: {
    ofertaId: string;   // disciplinaOfertasTable.id
    disciplinaId: string; disciplinaNome: string;
    cursoId: string; cursoNome: string;
    turnoId: string; turnoNome: string;
  }[];
  cursosCoordenados: { id: string; nome: string }[];
}
```

## Roles incluídas

`equipe_gestora`

## Agrupamento (Frontend)

`buildGroups(usuarios)` em `seshat-grupo.tsx` agrupa por `turnoId + cursoId` de cada `ofertas[]`. Membros sem ofertas ficam em `{ turnoNome: "Sem turno", cursoNome: "Sem curso" }`.

## Componente

`CarometroEquipeGestora` em `artifacts/seshat/src/pages/seshat-grupo.tsx`

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
