---
description: Spec do carômetro de Administração
---

# Administração

## Spec

Exibe os membros da equipe administrativa em formato de carômetro (grade de fotos com nome), agrupados por turno e curso. O agrupamento é feito **no frontend** — a API retorna um array plano.

## Endpoint

`GET /api/carometro/administracao`

Implementado em `artifacts/api-server/src/routes/seshat.ts` via `getUsuariosPorRoles(["secretaria"])`.

## Response Shape (API)

A API retorna um **array plano** de `UsuarioCardAPI[]` — **não** um objeto agrupado:

```typescript
type UsuarioCardAPI = {
  id: string;               // UUID (não número)
  nome: string | null;
  email: string;
  fotoUrl: string | null;   // camelCase
  codigoAcesso: string;
  roles: { id: string; nome: string }[];
  ofertas: {
    ofertaId: string; disciplinaId: string; disciplinaNome: string;
    cursoId: string; cursoNome: string;
    turnoId: string; turnoNome: string;
  }[];
  cursosCoordenados: { id: string; nome: string }[];
}
```

> **Nota:** O filtro "apenas usuários ativos" está documentado como regra de negócio mas **não está implementado** na query — todos os usuários com as roles matching são retornados.

## Agrupamento (Frontend)

O frontend usa `buildGroups(usuarios)` em `seshat-grupo.tsx` — mesmo padrão de equipe-pedagogica e equipe-gestora.

## Componente Frontend

```tsx
// artifacts/seshat/src/pages/seshat-grupo.tsx
export function CarometroAdministracao() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/administracao"
      titulo="Administração"
      descricao="Membros da equipe administrativa."
      showDisciplinas={false}
    />
  );
}
```

## Roles incluídas

`secretaria`

## Permissão

`carometro:view`

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
