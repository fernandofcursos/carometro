# Skill: Enturmação — Matrículas de Estudantes

## Conceito

Enturmação = vincular um `usuario` (role `estudante`) a uma `turma` por semestre.
Cada vínculo é uma **matrícula** na tabela `matriculas`.

## Regras de Negócio (críticas)

1. **Um curso por período**: estudante não pode estar em 2 cursos diferentes no mesmo semestre.
2. **Máximo 2 turmas/semestre**: mesmo curso → 1 principal + 1 complementar.
3. **Registro**: varchar(20), numérico, fornecido externamente — não é calculado.
4. **`principal`**: definido automaticamente pela API (true se primeira matrícula no período; false se já existe principal).

## Schema (`lib/db/src/schema/matriculas.ts`)

```typescript
matriculasTable: {
  id, usuarioId (FK → usuarios, restrict), turmaId (FK → turmas, restrict),
  registro (varchar 20, NOT NULL), ano (integer NOT NULL),
  semestre (smallint NOT NULL, CHECK IN (1,2)),
  principal (boolean, default true), ativo (boolean, default true),
  criadoEm, atualizadoEm, deletadoEm
  UNIQUE (usuarioId, turmaId, ano, semestre)
}
```

## GET /api/matriculas — resposta

```typescript
Array<{
  id, nome, criadoEm,           // usuário estudante
  matriculas: [{
    id, usuarioId, turmaId, turmaSigla,
    cursoId, cursoNome, registro,
    ano, semestre, principal, ativo, criadoEm
  }]
}>
```

Implementado com: buscar role "estudante" → listar usuarios → `inArray(usuarioIds)` na tabela `matriculas` com JOIN em turmas e cursos.

## POST /api/matriculas — fluxo de validação

```
1. insertMatriculaSchema.parse(req.body)
2. Buscar matriculas ativas do estudante no mesmo (ano, semestre)
3. JOIN turmasTable → cursosTable para obter cursoId da turmaAlvo
4. Se cursosNoSemestre contém cursoId diferente → 422 (1 curso por período)
5. Se matriculasNoSemestre.length >= 2 && mesmo curso → 422 (max 2 turmas)
6. principal = !jaPrincipal (automático)
7. db.insert(matriculasTable).values({ ...data, principal })
```

## Tratamento de Erros

Função `matriculaErrorMessage(err)` → `{ status, error }`:

| Trigger | Status | Mensagem |
|---|---|---|
| ZodError registro | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| ZodError semestre | 400 | "Semestre deve ser 1 ou 2." |
| Segundo curso no período | 422 | "Este estudante já está matriculado em outro curso neste semestre..." |
| 3ª matrícula no mesmo curso | 422 | "Limite de 2 turmas por semestre atingido..." |
| 23505 / uq_matricula | 409 | "Este estudante já está matriculado nesta turma neste semestre." |
| 23503 turma | 400 | "Turma não encontrada." |
| Outros | 500 | "Erro interno ao salvar a matrícula." |

## Frontend (`artifacts/seshat/src/pages/enturmacao/index.tsx`)

- `EnturmacaoPage`: lista de estudantes com busca
- `EstudanteCard`: accordion — expande para mostrar matrículas ativas e `MatriculaForm`
- `MatriculaForm`: Turma + Registro + Ano/Semestre → `POST /api/matriculas` via `fetch`
- Badge `principal` / `complementar` nos vínculos
- Remoção via AlertDialog → `DELETE /api/matriculas/:id`
- `apiMsg(err, fallback)`: extrai `err.data?.error` para exibir no toast

## Menu (layout.tsx)

```typescript
canManageEstudantes = hasAny("estudantes:manage")
// Grupo "Enturmação" visível para canViewEstudantes
// Item "Enturmação" → /enturmacao visível para canManageEstudantes
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Schema + insertMatriculaSchema |
| `artifacts/api-server/src/routes/matriculas.ts` | GET, POST, DELETE + validações |
| `artifacts/api-server/src/index.ts` | Registra `/api/matriculas` |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
| `artifacts/seshat/src/components/layout.tsx` | Menu |
| `.specs/features/enturmacao.md` | Spec completa |

## Migration SQL

```sql
CREATE TABLE IF NOT EXISTS matriculas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid        NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  turma_id     uuid        NOT NULL REFERENCES turmas(id)   ON DELETE RESTRICT,
  registro     varchar(20) NOT NULL,
  ano          integer     NOT NULL,
  semestre     smallint    NOT NULL,
  principal    boolean     NOT NULL DEFAULT true,
  ativo        boolean     NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  deletado_em  timestamptz,
  CONSTRAINT uq_matricula UNIQUE (usuario_id, turma_id, ano, semestre),
  CONSTRAINT ck_semestre  CHECK  (semestre IN (1, 2))
);
```
