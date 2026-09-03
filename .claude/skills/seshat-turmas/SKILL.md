# Skill: Turmas — CRUD e Regras de Negócio

## Modelo

Uma turma pertence a um curso e pode funcionar em **múltiplos turnos** (N:N via `turma_turnos`).

```
turmas (1) ──< turma_turnos >── (N) turnos
turmas (N) >── cursos (1)
```

### Schema (`lib/db/src/schema/turmas.ts` + `turma-turnos.ts`)

```typescript
turmasTable: {
  id, sigla (varchar 30, NOT NULL, único por curso),
  descricao (text, NOT NULL), cursoId (FK → cursos),
  modulo (varchar 4, nullable in DB, required in API — enum 'I'|'II'|'III'|'IV'|'V'|'VI'),
  ano (integer, nullable), semestre (smallint, nullable),
  ativo (boolean, default true), criadoEm, atualizadoEm, deletadoEm
  // constraint ck_turma_modulo CHECK modulo IN ('I','II','III','IV','V','VI')
}

turmaTurnosTable: {
  turmaId (FK → turmas, cascade delete),
  turnoId (FK → turnos, restrict),
  criadoEm
  UNIQUE (turmaId, turnoId)
}
```

`insertTurmaSchema` (Zod) estende o insert do drizzle com `turnoIds: string[].min(1)`.

## Endpoint POST /api/turmas

```typescript
// body
{ sigla, descricao, cursoId, modulo: "I"|"II"|"III"|"IV"|"V"|"VI", turnoIds: string[], ano?, semestre?, ativo? }

// fluxo
1. insertTurmaSchema.parse(req.body)      → valida e separa turnoIds
2. db.insert(turmasTable).values(turmaData)
3. db.insert(turmaTurnosTable).values(turnoIds.map(...))
4. registrarAuditoria
5. res.status(201).json({ ...turma, turnoIds })
```

## Endpoint PUT /api/turmas/:id

Substitui os turnos completamente: `DELETE turma_turnos WHERE turmaId = id` → `INSERT` com os novos `turnoIds`.

## Tratamento de Erros

| Erro | Mensagem ao usuário |
|---|---|
| ZodError em `turnoIds` | "Selecione ao menos um turno para a turma." |
| ZodError em `modulo` | "Selecione o módulo da turma (I a VI)." |
| 23514 / ck_turma_modulo | "Módulo inválido. Valores aceitos: I, II, III, IV, V, VI." |
| ZodError em `cursoId` | "Selecione um curso válido." |
| ZodError em `sigla` | "Sigla inválida (máx. 30 caracteres)." |
| ZodError em `descricao` | "Informe a descrição da turma." |
| 23505 / `uq_turmas_sigla_curso` | "Já existe uma turma com esta sigla neste curso." |
| 23503 + `turno` | "Um dos turnos selecionados não existe. Atualize a página e tente novamente." |
| 23503 + `curso` | "O curso selecionado não existe. Atualize a página e tente novamente." |
| Outros | "Erro interno ao salvar a turma. Tente novamente." |

O backend usa `turmaErrorMessage(err)` que retorna `{ status, error }` — todos os catches de POST e PUT chamam essa função.

## Frontend (`artifacts/seshat/src/pages/turmas/index.tsx`)

- Erros extraídos via `apiMsg(err, fallback)` que lê `(err as ApiError).data?.error`
- `ApiError` importada de `@workspace/api-client-react`
- Toast exibe `title` + `description` com a mensagem da API

## Join de turno em outras rotas — padrão obrigatório

`turmasTable` **não tem** coluna `turnoId`. Toda rota que precisa do nome do turno de uma turma deve fazer JOIN via `turmaTurnosTable`:

```typescript
import { turmaTurnosTable } from "@workspace/db";

// CORRETO
.leftJoin(turmaTurnosTable, eq(turmaTurnosTable.turmaId, algumaColunaComTurmaId))
.leftJoin(turnosTable, eq(turmaTurnosTable.turnoId, turnosTable.id))

// ERRADO — coluna não existe
.leftJoin(turnosTable, eq(turmasTable.turnoId, turnosTable.id))
```

Rotas que já usam o padrão correto: `seshat.ts`, `estudantes.ts`, `matriculas.ts`.  
Ao criar novas rotas que precisam de `turnoNome`, sempre usar `turmaTurnosTable` como intermediário.

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/turmas.ts` | Tabela + `insertTurmaSchema` (com `turnoIds`) |
| `lib/db/src/schema/turma-turnos.ts` | Junction table N:N |
| `artifacts/api-server/src/routes/turmas.ts` | CRUD + `turmaErrorMessage()` |
| `artifacts/seshat/src/pages/turmas/index.tsx` | UI com `TurnoCheckboxes` + `apiMsg()` |
| `.specs/features/turmas.md` | Spec completa |
