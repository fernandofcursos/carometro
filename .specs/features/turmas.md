# Spec: Turmas

**Agente responsável:** Hermes  
**Status:** Implementado ✅

## Comportamento

### GET /api/turmas

Retorna turmas ativas (sem `deletadoEm`) com JOIN para exibir `cursoNome` e `turnoNome`.

**Requer:** `turmas:manage`

**Saída:**
```typescript
{
  turmas: Array<{
    id: string;
    sigla: string;         // ex: "3A", "2B" (max 10 chars)
    descricao: string;
    ativo: boolean;
    cursoId: string;
    turnoId: string;
    cursoNome: string | null;
    turnoNome: string | null;
    criadoEm: string;
    atualizadoEm: string;
  }>
}
```

### POST /api/turmas

**Requer:** `turmas:manage`

**Entrada:**
```typescript
{ sigla: string; descricao: string; cursoId: string; turnoId: string; ativo?: boolean }
```

**Constraint único:** `(sigla, cursoId)` — mesma sigla pode existir em cursos diferentes.

**Erro:** `400` se cursoId ou turnoId inexistentes (FK violated)

### PUT /api/turmas/:id

**Requer:** `turmas:manage` — mesma validação do POST

### DELETE /api/turmas/:id

Soft delete: seta `deletadoEm` e `ativo = false`.  
**Requer:** `turmas:manage`  
**Nota:** Turmas com estudantes matriculados não impedem exclusão (estudante mantém `turmaId` para histórico).

## Casos de Teste

- [ ] GET retorna `cursoNome` e `turnoNome` via JOIN
- [ ] POST com `cursoId` inexistente → 400 (FK error)
- [ ] POST com sigla + cursoId duplicados → 400 (unique constraint)
- [ ] DELETE não remove da tabela (soft delete)
- [ ] GET não retorna turmas com `deletadoEm` preenchido
