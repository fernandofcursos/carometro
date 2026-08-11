# Spec: Turmas

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

## Modelo de Dados

Uma turma pertence a um curso e pode funcionar em **múltiplos turnos** (relação N:N via `turma_turnos`).

```
turmas (1) ──< turma_turnos >── (N) turnos
turmas (N) >── cursos (1)
```

### Tabela `turmas`
| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `sigla` | varchar(10) | NOT NULL, único por curso |
| `descricao` | text | NOT NULL |
| `curso_id` | uuid FK | NOT NULL → cursos |
| `ano` | integer | opcional |
| `semestre` | smallint | opcional (1 ou 2) |
| `ativo` | boolean | default true |

### Tabela `turma_turnos`
| Campo | Tipo | Regra |
|---|---|---|
| `turma_id` | uuid FK | NOT NULL → turmas (cascade delete) |
| `turno_id` | uuid FK | NOT NULL → turnos |
| unique | — | (turma_id, turno_id) |

## Endpoints

### GET /api/turmas
**Requer:** `turmas:manage`

Retorna turmas ativas com JOIN ao curso e lista de turnos associados.

```typescript
Array<{
  id: string;
  sigla: string;
  descricao: string;
  ativo: boolean;
  ano: number | null;
  semestre: number | null;
  cursoId: string;
  cursoNome: string | null;
  turnos: Array<{ id: string; nome: string | null }>;
  criadoEm: string;
  atualizadoEm: string;
}>
```

### POST /api/turmas
**Requer:** `turmas:manage`

```typescript
{
  sigla: string;
  descricao: string;
  cursoId: string;
  turnoIds: string[];   // ao menos 1 obrigatório
  ano?: number;
  semestre?: number;
  ativo?: boolean;
}
```

Insere em `turmas` e em `turma_turnos` para cada turnoId.

### PUT /api/turmas/:id
**Requer:** `turmas:manage`

Mesma estrutura do POST. **Substitui** os turnos da turma: remove todos de `turma_turnos` e reinsere.

### DELETE /api/turmas/:id
Soft delete: seta `deletadoEm` e `ativo = false`.
`turma_turnos` são excluídos em **cascade**.

## Regras de Negócio

- **Ao menos um turno obrigatório** — `turnoIds.length >= 1`
- **Sigla única por curso** — constraint `uq_turmas_sigla_curso(sigla, cursoId)`
- Mesma sigla pode existir em cursos diferentes
- Soft delete não impede estudantes de manter `turmaId` para histórico

## Casos de Teste

- GET retorna `turnos: []` para turmas sem vínculo de turno
- POST sem `turnoIds` ou array vazio → 400
- POST com turnoIds válidos → 201 com turnos vinculados
- PUT substitui turnos completamente (não acumula)
- DELETE seta `deletadoEm`; `turma_turnos` removidos em cascade
- GET não retorna turmas com `deletadoEm` preenchido
