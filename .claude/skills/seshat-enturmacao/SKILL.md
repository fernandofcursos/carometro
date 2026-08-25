# Skill: Enturmação — Matrículas de Estudantes

## Conceito

Enturmação = vincular um `usuario` (role `estudante`) a uma `turma` (curso + período).
Cada vínculo é uma **matrícula** na tabela `matriculas`.

## Menu

```
Grupo: "Enturmação"  (canManageEstudantes = hasAny("estudantes:manage"))
└── "Estudantes" → /enturmacao
```

Não há item "Estudantes" separado neste grupo — a página de enturmação É a tela de estudantes.

## Regras de Negócio

| Regra | Detalhe |
|---|---|
| **Um curso** | Estudante só pode estar em **um único curso**. Validado em `POST /api/matriculas` |
| **Sem dois cursos simultâneos** | Bloqueia enturmação em curso diferente do atual → 422 |
| **Disciplinas do semestre atual** | Pode cursar uma ou mais; sem restrição adicional |
| **Disciplina de semestre anterior** | Uma única, em **turno contrário** ao da turma principal; validada em `usuario_disciplinas` |
| **Registro** | varchar(20), somente dígitos, fornecido externamente |

## Schema (`lib/db/src/schema/matriculas.ts`)

```typescript
matriculasTable: {
  id, usuarioId (FK → usuarios, restrict),
  turmaId (FK → turmas, restrict),
  registro (varchar 20, NOT NULL),
  ano (integer NOT NULL), semestre (smallint NOT NULL, CHECK IN (1,2)),
  ativo (boolean, default true),
  criadoEm, atualizadoEm, deletadoEm
  UNIQUE (usuarioId, turmaId, ano, semestre)
}
```

## GET /api/matriculas — query

**Base: `matriculas`** — não usa a role `estudante` como filtro.  
Isso evita estudantes "fantasmas": matriculados no banco mas invisíveis porque a role não existia na hora da enturmação.

```typescript
db.select({...})
  .from(matriculasTable)
  .innerJoin(usuariosTable, ...)
  .innerJoin(turmasTable, ...)
  .innerJoin(cursosTable, ...)
  .where(and(isNull(matriculasTable.deletadoEm), isNull(usuariosTable.deletadoEm)))
  .orderBy(usuariosTable.nome, matriculasTable.ano, matriculasTable.semestre)
// Resultado agrupado por usuário via Map
```

## POST /api/matriculas — fluxo

```
1. enturmarSchema.parse(req.body)
2. Busca cursoId da turmaAlvo (JOIN turmas → cursos)
3. Resolve usuário (por usuarioId ou email; cria se não existir)
4. getOrCreateEstudanteRoleId() — cria a role 'estudante' automaticamente se ausente
5. Atribui role 'estudante' ao usuário (INSERT ON CONFLICT skip)
6. Verifica unicidade (usuarioId, ano, semestre) — 422 se duplicado
7. INSERT matriculas
8. Sincroniza estudantes (try/catch tolerante a falha)
```

## Tratamento de Erros — `matriculaErrorMessage(err)`

**Importante:** Drizzle ORM encapsula erros PostgreSQL em `err.cause.code`, não em `err.code`. A função `pgCode(err)` extrai o código correto verificando `err.cause?.code ?? err.code`.

| Trigger | Status | Mensagem |
|---|---|---|
| ZodError `registro` | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| ZodError `semestre` | 400 | "Semestre deve ser 1 ou 2." |
| Turma não encontrada | 400 | "Turma não encontrada." |
| Outro curso ativo | 422 | "Este estudante já está enturmado em '...'." |
| 23505 + uq_matricula_semestre | 409 | "Este estudante já está enturmado em outro curso neste semestre." |
| 23505 | 409 | "Este estudante já está enturmado nesta turma neste semestre." |
| 23503 (FK) | 400 | "Turma ou estudante inválidos." |
| 23502 (NOT NULL) | 400 | "Dados obrigatórios não informados." |
| 42703 (coluna inexistente) | 500 | "Erro de schema no banco. Execute as migrações." |
| Outros | 500 | "Erro interno ao salvar a enturmação. [code=X detalhe]" (dev only) |

## Frontend (`artifacts/seshat/src/pages/enturmacao/index.tsx`)

- `EnturmacaoPage`: lista de estudantes com busca local
- `EstudanteCard`: accordion — matrículas ativas + `MatriculaForm`
- `MatriculaForm`: Turma + Registro (somente dígitos) + Ano + Semestre
- Remoção via AlertDialog → `DELETE /api/matriculas/:id`
- `apiMsg(err, fallback)`: extrai `err.data?.error` para exibir no toast

## Cópia de senha — tratamento de erro obrigatório

`NovoUsuarioDialog` usa `navigator.clipboard.writeText()`. Sempre incluir `.catch()` para evitar "Uncaught (in promise)" quando o clipboard é bloqueado por extensão, foco perdido ou contexto inseguro:

```typescript
navigator.clipboard.writeText(senhaGerada)
  .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
  .catch(() => {}); // silencioso — não há ação alternativa necessária
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Schema + insertMatriculaSchema |
| `artifacts/api-server/src/routes/matriculas.ts` | Lógica de negócio + erros |
| `artifacts/api-server/src/index.ts` | Registra `/api/matriculas` |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
| `artifacts/seshat/src/components/layout.tsx` | Menu |
| `scripts/migrate-matriculas.sql` | DDL da tabela |
| `.specs/features/enturmacao.md` | Spec completa |
