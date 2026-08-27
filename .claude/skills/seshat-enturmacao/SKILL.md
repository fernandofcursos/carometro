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
| **Até 2 matrículas ativas** | Estudante pode ter **no máximo 2 matrículas ativas** no mesmo curso. |
| **Proibido cursos diferentes** | Se já existe matrícula ativa, a nova turma deve pertencer ao mesmo curso. → 422 se curso diferente. |
| **Segunda enturmação: módulo inferior** | A segunda enturmação deve ser em **módulo numericamente inferior** ao módulo da turma já matriculada. Ex.: já está em Módulo II → pode adicionar Módulo I; não pode adicionar Módulo II ou III. Verificado comparando `turmas.modulo` (romano). → 422 se módulo ≥ existente. |
| **Módulo inferior — máx. 3 disciplinas** | Quando enturmado em módulo inferior como segunda enturmação, o estudante pode cursar **no máximo 3 disciplinas** desse módulo. UI força modo checkbox com limite; label "Disciplinas (módulo inferior — máx. 3)". |
| **Turno diferente — verificado nas disciplinas** | O conflito de turno não é verificado na turma, mas nas **disciplinas cursadas** (`usuario-disciplinas`). O estudante deve selecionar disciplinas do módulo inferior em turno diferente das disciplinas do módulo principal. |
| **Módulo menor (flag de curso) — max 3 disciplinas** | Cursos com `moduloMenor = true` limitam a seleção a **3 disciplinas por turno**. Validado na API (PUT usuario-disciplinas) e reforçado na UI. |
| **Módulo maior — 1 ou todas** | Cursos com `moduloMenor = false` exigem que o estudante curse **uma única disciplina ou todas** do turno. Seleção parcial → 422. |
| **Registro** | varchar(20), somente dígitos, fornecido externamente |
| **Visibilidade** | A página lista **todos os estudantes** — com ou sem matrícula ativa |

### Comparação de Módulos (Roman → Int)

```typescript
const ROMANOS: Record<string, number> = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8 };
function moduloNumerico(m: string | null | undefined): number {
  if (!m) return 0;
  return ROMANOS[m.toUpperCase().trim()] ?? parseInt(m ?? "", 10) || 0;
}
// moduloNumerico("I") → 1, moduloNumerico("II") → 2
// Ambos devem ser > 0 para que a validação seja aplicada (se um é nulo, permite)
```

### Detecção de Módulo Inferior no Frontend

```typescript
const moduloInferiorSecundario = useMemo(() => {
  if (!turmaAtual?.modulo || !estudante?.matriculas?.length || isEditing) return false;
  const moduloNovo = moduloNumerico(turmaAtual.modulo);
  if (moduloNovo === 0) return false;
  return estudante.matriculas.some((m) => {
    const turmaExist = turmas.find((t) => t.id === m.turmaId);
    return moduloNumerico(turmaExist?.modulo) > moduloNovo;
  });
}, [turmaAtual, estudante, turmas, isEditing]);
// Quando true → DisciplinasSeletor mostra checkboxes com máx 3
```

## Schema (`lib/db/src/schema/matriculas.ts`)

```typescript
matriculasTable: {
  id, usuarioId (FK → usuarios, restrict),
  turmaId (FK → turmas, restrict),
  turnoId (FK → turnos, set null),  // turno ESPECÍFICO do estudante nesta matrícula
  registro (varchar 20, NOT NULL),
  ano (integer NOT NULL), semestre (smallint NOT NULL, CHECK IN (1,2)),
  ativo (boolean, default true),
  criadoEm, atualizadoEm, deletadoEm
  UNIQUE (usuarioId, turmaId) WHERE deletadoEm IS NULL  → "uq_matricula_usuario_turma"
}
// Migration: scripts/migrate-matriculas-turno.sql
```

> **Por que turnoId na matrícula?** Uma turma pode ter múltiplos turnos. Sem armazenar o turno específico, a API exibia todos os turnos da turma em vez do turno real do aluno, impedindo a validação correta da segunda enturmação.

> **Por que índice parcial?** Sem o `WHERE deletadoEm IS NULL`, linhas soft-deleted bloqueiam reenturmação com erro 23505 ("enturmado fantasma").

### Exibição do Turno na Tabela
```typescript
// Mostrar turno específico (turnoNome) ou fallback para todos os turnos da turma
{m.turnoNome ?? m.turnos.map(t => t.nome).join(", ") || "—"}
```

## GET /api/matriculas — query

Retorna **todos os estudantes** — com ou sem matrícula ativa.  
A lista é a UNIÃO de:
1. Usuários com role `estudante` (mesmo sem matrícula)
2. Usuários com matrícula ativa (mesmo que a role tenha sido removida)

Implementação: LEFT JOIN de `usuariosRoles(estudante)` com `matriculas`, ou UNION das duas queries, deduplicado por `usuarioId`.

Cada item inclui:
- `matriculas[]` — matrículas ativas, cada uma com `turnos: [{id, nome}]` dos turnos da turma
- `disciplinas[]` — disciplinas cursadas via `usuario_disciplinas`

## PATCH /api/matriculas/:id — fluxo

Edição de uma matrícula existente. Aceita `{turmaId?, registro?, ano?, semestre?}`.
Se `turmaId` muda, re-executa todas as validações de negócio considerando as OUTRAS matrículas ativas (excluindo a editada com `ne(matriculasTable.id, id)`).

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
| Curso diferente (app-level) | 422 | "Este estudante já está enturmado no curso '&lt;curso&gt;'. Não é possível enturmar em cursos diferentes." |
| Limite 2 matrículas (app-level) | 422 | "Este estudante já possui 2 enturmações ativas no curso '&lt;curso&gt;' (limite máximo)." |
| Mesmo turno (app-level) | 422 | "Este estudante já está enturmado na turma '&lt;sigla&gt;' neste turno. Só é permitido em turnos diferentes." |
| Módulo menor > 3 disciplinas/turno | 422 | "Módulo menor: máximo 3 disciplinas por turno." |
| Módulo maior — seleção parcial | 422 | "Módulo maior: selecione uma ou todas as disciplinas do turno." |
| 23505 + uq_matricula_usuario_turma | 409 | "Este estudante já está matriculado nesta turma." |
| 23505 genérico | 409 | "Este estudante já está enturmado nesta turma neste período." |
| 23503 (FK) | 400 | "Turma ou estudante inválidos." |
| 23502 (NOT NULL) | 400 | "Dados obrigatórios não informados." |
| 42703 (coluna inexistente) | 500 | "Erro de schema no banco. Execute as migrações." |
| Outros | 500 | "Erro interno ao salvar a enturmação. [code=X detalhe]" (dev only) |

## Frontend (`artifacts/seshat/src/pages/enturmacao/index.tsx`)

- `EnturmacaoPage`: lista **todos** os estudantes (com e sem matrícula), busca local por nome
- `EstudanteCard`: accordion mostrando cabeçalho + tabela de enturmações + form inline
- `EnturmarForm`: formulário em cascata Curso→Turma→Turno→Disciplinas; suporta POST (novo) e PATCH (edição)
- `DisciplinasSeletor`: seletor de disciplinas por módulo menor/maior
- Remoção via AlertDialog com 3 botões (Cancelar/Não/Sim)
- `apiMsg(err, fallback)`: extrai `err.data?.error` para exibir no toast

### EstudanteCard — tabela de enturmações

| Coluna | Descrição |
|---|---|
| Curso | cursoNome |
| Turno | nomes dos turnos da turma (de `matricula.turnos`) |
| Turma | turmaSigla |
| Registro | registro numérico |
| Semestre | ano/semestre |
| Ações | lápis (editar) + lixeira (excluir) |

### EnturmarForm — cascata

```
cursoId → turmasFiltradas (por cursoId)
turmaId → turnosDisponiveis (turnos da turma selecionada)
turnoId → ofertasFiltradas (por cursoId + turnoId)
→ DisciplinasSeletor
→ registro | ano | semestre
```

- Se `turnosDisponiveis.length === 1`, `effectiveTurnoId` é auto-preenchido
- `useEffect` em `effectiveTurnoId` reseta seleção de disciplinas (pre-popula se editando)
- Salvar: chama `PATCH` ou `POST` na matrícula, depois `PUT /api/usuario-disciplinas/:usuarioId`

### DisciplinasSeletor

```typescript
// Módulo menor
<Checkbox disabled={!selecionado && selCount >= 3} />
<Badge>{selCount}/3</Badge>

// Módulo maior
<Button>Todas ({total})</Button>  // ou "Selecionar uma" → radio buttons
```

### AlertDialog de exclusão — 3 botões

```typescript
<Button onClick={() => { setDeleteTarget(null); setOpen(false); }}>Cancelar</Button>  // fecha + colapsa
<Button onClick={() => setDeleteTarget(null)}>Não</Button>                           // fecha apenas
<Button onClick={handleDelete}>Sim</Button>                                          // deleta
```

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
