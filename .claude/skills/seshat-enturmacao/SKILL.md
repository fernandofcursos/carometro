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
| **Uma matrícula ativa** | Estudante só pode ter **uma única matrícula ativa** — um curso, um turno. Verificado antes do INSERT via query (isNull deletadoEm). → 422 se já existe. |
| **Proibido dois cursos mesmo em turnos diferentes** | Não importa o turno — se há matrícula ativa, nova enturmação é bloqueada até o admin remover a atual. |
| **Disciplinas** | Pode cursar **uma ou todas** as disciplinas do curso; opção padrão é "Todas as disciplinas" |
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
  // Índice parcial — exclui soft-deletes da unicidade:
  UNIQUE (usuarioId, ano, semestre) WHERE deletadoEm IS NULL  → "uq_matricula_ativo"
}
```

> **Por que índice parcial?** Sem o `WHERE deletadoEm IS NULL`, linhas soft-deleted bloqueiam reenturmação com erro 23505 ("enturmado fantasma") — o estudante aparece como livre na UI mas o banco recusa o INSERT.

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
| Matrícula ativa já existe (app-level) | 422 | "Este estudante já está enturmado em '&lt;curso&gt; — &lt;turma&gt;' (&lt;ano&gt;/&lt;sem&gt;). Remova a enturmação atual antes de enturmar em outro curso." |
| 23505 + uq_matricula_ativo | 409 | "Este estudante já possui uma matrícula ativa. Remova a enturmação atual antes de enturmar em outro curso." |
| 23505 genérico | 409 | "Este estudante já está enturmado nesta turma neste período." |
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
