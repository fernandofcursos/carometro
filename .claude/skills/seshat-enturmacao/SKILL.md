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
| **Disciplinas** | Pode cursar **uma ou todas** as disciplinas do curso; opção padrão é "Todas as disciplinas" |
| **Disciplina de semestre anterior** | Uma única, em **turno contrário** ao da turma principal; validada em `usuario_disciplinas` |
| **Registro** | varchar(20), somente dígitos, fornecido externamente |
| **Visibilidade** | A página lista **todos os estudantes** — com ou sem matrícula ativa |

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

Retorna **todos os estudantes** — com ou sem matrícula ativa.  
A lista é a UNIÃO de:
1. Usuários com role `estudante` (mesmo sem matrícula)
2. Usuários com matrícula ativa (mesmo que a role tenha sido removida)

Implementação: LEFT JOIN de `usuariosRoles(estudante)` com `matriculas`, ou UNION das duas queries, deduplicado por `usuarioId`.

Cada item inclui:
- `matriculas[]` — matrículas ativas do estudante (vazio se não enturmado)
- `disciplinas[]` — disciplinas cursadas via `usuario_disciplinas`, com `disciplinaNome`, `cursoNome`, `turnoNome`

```typescript
// Estratégia: buscar todos com role estudante + LEFT JOIN matriculas
// + buscar todos com matricula ativa sem role → UNION deduplicada
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

- `EnturmacaoPage`: lista **todos** os estudantes (com e sem matrícula), busca local por nome
- `EstudanteCard`: accordion com três seções:
  1. **Matrículas ativas** (vazio se não enturmado)
  2. **Disciplinas cursadas** — agrupadas por Curso e Turno
  3. **Formulário de enturmação** (`MatriculaForm`)
- `MatriculaForm`: Turma + Registro + Ano + Semestre + **seleção de disciplinas**
- Remoção de matrícula via AlertDialog → `DELETE /api/matriculas/:id`
- `apiMsg(err, fallback)`: extrai `err.data?.error` para exibir no toast

### Seleção de Disciplinas

Componente `DisciplinasSelector` exibido dentro do `EstudanteCard` e no `MatriculaForm`:

```
Estrutura visual:
▸ [Curso A]
  ▸ [Turno Manhã]
    [✓] Todas as disciplinas   ← toggle que seleciona/deseleciona todas do grupo
    [✓] Disciplina X
    [✓] Disciplina Y
  ▸ [Turno Tarde]
    [ ] Todas as disciplinas
    [ ] Disciplina Z
```

**Comportamento:**
- Ao abrir sem seleção prévia: "Todas as disciplinas" marcado por padrão para cada grupo
- Marcar "Todas as disciplinas": seleciona todos os checkboxes do grupo Curso/Turno
- Desmarcar "Todas as disciplinas": desmarca todos do grupo
- Marcar/desmarcar disciplina individual: atualiza o estado de "Todas" do grupo (indeterminate se parcial)
- Salvar: `POST /api/usuario-disciplinas` com array de `disciplinaOfertaIds`

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
