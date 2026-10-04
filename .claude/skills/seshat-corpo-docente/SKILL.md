---
description: Spec do carômetro de Corpo Docente
---

# Corpo Docente

## Spec

Exibe professores e educadores da instituição em formato de carômetro (grade de fotos com nome e disciplinas), agrupados por turno e curso. O agrupamento é feito **no frontend** — a API retorna um array plano.

## Endpoint

`GET /api/carometro/corpo-docente`

Implementado em `artifacts/api-server/src/routes/seshat.ts` via `getUsuariosPorRoles(["professor", "educador"])`.

## Response Shape (API)

A API retorna um **array plano** de `UsuarioCardAPI[]` — **não** um objeto agrupado:

```typescript
type UsuarioCardAPI = {
  id: string;               // UUID (não número)
  nome: string | null;
  email: string;
  fotoUrl: string | null;   // camelCase — construída com prioridade:
                            //   1. fotoId → `/api/fotos/${fotoId}`
                            //   2. fotoStorageKey → `/api/usuarios/${id}/foto`
                            //   3. null
  codigoAcesso: string;
  roles: { id: string; nome: string }[];   // array, não string única
  ofertas: {
    disciplinaId: string; disciplinaNome: string;
    cursoId: string; cursoNome: string;
    turnoId: string; turnoNome: string;
  }[];
  cursosCoordenados: { id: string; nome: string }[];
}
```

> **Nota:** Não há campo `disciplinas` diretamente no membro — as disciplinas são derivadas de `ofertas[]` no frontend, filtradas por grupo (`turnoId + cursoId`).

> **Nota:** O filtro "apenas usuários ativos" está documentado como regra de negócio mas **não está implementado** na query.

## Agrupamento (Frontend)

O frontend usa `buildGroups(usuarios)` em `seshat-grupo.tsx`:

- Cada usuário é inserido em **um grupo por combinação `turnoId + cursoId`** de suas `ofertas[]`
- Um professor com múltiplas ofertas aparece em **múltiplos grupos** — correto e intencional
- As disciplinas exibidas no card são filtradas para o `cursoId` do grupo em que o card aparece
- Professores sem `ofertas` vão para o grupo `{ turnoNome: "Sem turno", cursoNome: "Sem curso" }`
- Grupos ordenados por `turnoNome` depois `cursoNome` (`localeCompare "pt-BR"`)

## Componente Frontend

```tsx
// artifacts/seshat/src/pages/seshat-grupo.tsx
export function CarometroCorpoDocente() {
  return (
    <CarometroGrupoPage
      endpoint="/api/carometro/corpo-docente"
      titulo="Corpo Docente"
      descricao="Professores e docentes agrupados por turno e curso."
      // showDisciplinas não passado → herda default true (disciplinas visíveis)
    />
  );
}
```

`CarometroGrupoPage` usa `useState` + `useEffect` + `fetch()` — **sem React Query**.

## Roles incluídas

`professor`, `educador`

## Padrão Visual dos Cards

Ver skill `seshat-carometro-estudantes` — seção "Padrão Visual — Cards Fotográficos (3×4)".

Cards usam proporção 3:4 (retrato), tamanhos `w-16 h-[85px]` (small) / `w-20 h-[107px]` (normal), grade `flex flex-wrap gap-2`. Nunca usar `w-24`/`w-28` nos cards de carômetro.
