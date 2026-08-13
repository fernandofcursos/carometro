# Skill: Disciplinas — CRUD e Ofertas

## Modelo

```
disciplinas (1) ──< disciplina_ofertas >── cursos (1)
                                       └── turnos (1)
disciplina_ofertas (1) ──< usuario_disciplinas >── usuarios (professores)
```

### Schema

```typescript
// lib/db/src/schema/disciplinas.ts
disciplinasTable: { id, nome (text, NOT NULL, UNIQUE), criadoEm, atualizadoEm }

// lib/db/src/schema/disciplina-ofertas.ts
disciplinaOfertasTable: {
  id, disciplinaId (FK → disciplinas, cascade delete),
  cursoId (FK → cursos, cascade delete),
  turnoId (FK → turnos, cascade delete),
  ativo (boolean, default true)
  UNIQUE (disciplinaId, cursoId, turnoId)
}
```

## Permissão: `disciplinas:manage`

Atribuída ao role `administrador` via `seedPermissoes`.

**Menu não aparece?** Executar `docker compose run --rm dev db:seed` para sincronizar.

## GET /api/disciplinas — estrutura de resposta

```typescript
Array<{
  id, nome, criadoEm, atualizadoEm,
  ofertas: Array<{ id, disciplinaId, cursoId, cursoNome, turnoId, turnoNome }>
}>
```

O GET busca as ofertas com `fetchOfertas(ids)` — JOIN em `disciplina_ofertas`, `cursos`, `turnos` via `inArray`.

## PUT /api/disciplinas/:id/ofertas

```typescript
{ ofertas: [{ cursoId, turnoId }] }
```

Substitui completamente:
1. `DELETE disciplina_ofertas WHERE disciplinaId = id`
2. `INSERT ... onConflictDoNothing()`

Array vazio remove todos os vínculos. Retorna `{ ok, total, ofertas }`.

## Tratamento de Erros

Função `disciplinaErrorMessage(err)` → `{ status, error }`:

| Erro | Mensagem |
|---|---|
| ZodError `nome` | "Informe o nome da disciplina." |
| 23505 / `disciplinas_nome` | "Já existe uma disciplina com este nome." |
| 23503 | "Curso ou turno referenciado não existe. Atualize a página e tente novamente." |
| Outros | "Erro interno ao salvar a disciplina. Tente novamente." |

## Frontend (`artifacts/seshat/src/pages/disciplinas/index.tsx`)

- `OfertasModal` — matriz cursos × turnos com checkboxes; chama `PUT /api/disciplinas/:id/ofertas`
- `DiscRow` — inline edit do nome; botão de grade abre `OfertasModal`
- `useListDisciplinas` retorna `ofertas[]` por disciplina

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/disciplinas.ts` | Tabela + `insertDisciplinaSchema` |
| `lib/db/src/schema/disciplina-ofertas.ts` | Tabela de ofertas (N:N disciplina × curso × turno) |
| `artifacts/api-server/src/routes/disciplinas.ts` | CRUD + ofertas + `disciplinaErrorMessage()` |
| `artifacts/seshat/src/pages/disciplinas/index.tsx` | UI com `OfertasModal` + inline edit |
| `.specs/features/disciplinas.md` | Spec completa |
