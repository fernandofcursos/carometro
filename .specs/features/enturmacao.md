# Spec: Enturmação

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

## Conceito

Enturmação é o vínculo entre um estudante (usuário com role `estudante`) e uma **turma** (que representa um curso em um período). Cada vínculo é uma **matrícula**.

O menu lateral exibe o grupo **"Enturmação"** com o item **"Estudantes"** apontando para `/enturmacao`. Visível somente para usuários com `estudantes:manage`.

---

## Regras de Negócio

| # | Regra |
|---|---|
| 1 | **Mesmo curso, turnos diferentes**: o estudante pode estar enturmado em **até 2 turmas**, desde que sejam do **mesmo curso** e de **turnos distintos**. |
| 2 | **Proibido cursos diferentes**: não é possível enturmar em cursos distintos. Se o estudante já tem matrícula ativa, a nova turma deve pertencer ao mesmo curso. |
| 3 | **Proibido mesmo turno**: dentro do mesmo curso, não é permitido enturmar em duas turmas do mesmo turno. A verificação é feita via `turma_turnos`. |
| 4 | **Máximo 2 enturmações ativas**: mesmo no mesmo curso, o limite é 2 matrículas ativas simultaneamente. |
| 5 | **Módulo menor — máximo 3 disciplinas por turno**: cursos com `modulo_menor = true` limitam a seleção de disciplinas a **no máximo 3 por turno**. Validado na API (`PUT /api/usuario-disciplinas/:usuarioId`) e na UI (checkbox desabilitado ao atingir o limite). |
| 6 | **Módulo maior — uma ou todas**: cursos com `modulo_menor = false` exigem que o estudante curse **uma única disciplina ou todas as disciplinas** do turno. Seleção parcial intermediária não é permitida. → 422 se parcial. |
| 7 | **Opção padrão de disciplinas**: ao enturmar sem seleção prévia, a UI inicializa com **todas as disciplinas** selecionadas (para cursos normais). |
| 8 | **Registro numérico**: fornecido externamente, obrigatório, máximo 20 dígitos. |
| 9 | **Visibilidade**: a página lista **todos os estudantes** — com ou sem enturmação. |

---

## Modelo de Dados

```
usuarios (role estudante) (1) ──< matriculas >── (1) turmas → cursos
```

### Tabela `matriculas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `usuarioId` | uuid FK | → usuarios (restrict delete) |
| `turmaId` | uuid FK | → turmas (restrict delete) |
| `registro` | varchar(20) | NOT NULL, somente dígitos |
| `ano` | integer | NOT NULL |
| `semestre` | smallint | NOT NULL, CHECK IN (1, 2) |
| `ativo` | boolean | default true |
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |
| `deletadoEm` | timestamptz | soft delete |
| UNIQUE parcial | — | (usuarioId, turmaId) WHERE deletadoEm IS NULL — "uq_matricula_usuario_turma" — impede matrícula duplicada na mesma turma |

### Relação com disciplinas

Disciplinas cursadas pelo estudante (disciplinas do semestre atual e eventual disciplina de semestre anterior) são geridas via `usuario_disciplinas` → `disciplina_ofertas`. A validação da regra do semestre anterior e turno contrário é feita na camada de API de `usuario_disciplinas`.

---

## Endpoints

### GET /api/matriculas
**Requer:** `estudantes:manage`

Retorna **todos os estudantes** (com ou sem matrícula ativa), com suas matrículas e disciplinas cursadas.

A lista é composta pela UNIÃO de:
- Usuários com role `estudante` (mesmo sem matrícula)
- Usuários que tenham ao menos uma matrícula ativa (mesmo que a role tenha sido removida)

```typescript
Array<{
  id: string;
  nome: string | null;
  criadoEm: string;
  matriculas: Array<{
    id: string;
    usuarioId: string;
    turmaId: string;
    turmaSigla: string;
    cursoId: string;
    cursoNome: string;
    registro: string;
    ano: number;
    semestre: number;
    ativo: boolean;
    criadoEm: string;
    turnos: Array<{ id: string; nome: string }>;  // turnos da turma
  }>;
  disciplinas: Array<{
    disciplinaOfertaId: string;
    disciplinaNome: string;
    cursoNome: string;
    turnoNome: string;
  }>;
}>
```

### PATCH /api/matriculas/:id
**Requer:** `estudantes:manage`

Atualiza campos de uma matrícula existente. Aceita qualquer subconjunto de campos:

```typescript
{
  turmaId?: string;
  registro?: string;
  ano?: number;
  semestre?: 1 | 2;
}
```

Se `turmaId` mudar, re-valida todas as regras de negócio considerando as outras matrículas ativas do estudante (excluindo a que está sendo editada).

### POST /api/matriculas
**Requer:** `estudantes:manage`

```typescript
{
  usuarioId: string;
  turmaId: string;
  registro: string;   // numérico, máx 20 dígitos
  ano: number;        // 2000–2100
  semestre: 1 | 2;
}
```

**Validações:**
1. `enturmarSchema.parse(req.body)` — valida tipos e formato de registro
2. Busca o cursoId da turmaAlvo via JOIN
3. Se `email` fornecido: busca usuário por `emailHash`; cria se não existir (com bcrypt hash, codigoAcesso, e-mail de boas-vindas)
4. **`getOrCreateEstudanteRoleId()`** — garante que a role `estudante` existe; cria automaticamente se ausente
5. Atribui role `estudante` ao usuário (se ainda não tiver)
6. Verifica unicidade `(usuarioId, ano, semestre)` → 422 se duplicado
7. `INSERT matriculas`
8. **Sincroniza `estudantes`** (necessário para o carômetro e para registro de ocorrências):
   - Se já existe registro em `estudantes` com este `usuarioId` → atualiza `turmaId`
   - Se existe registro com mesmo `registro` mas sem `usuarioId` → vincula `usuarioId`
   - Se não existe nenhum → cria registro em `estudantes` com nome, registro, turmaId, usuarioId, dataNascimento
   - Falha na sincronização não cancela a matrícula (tolerância a falha, apenas loga)

### DELETE /api/matriculas/:id
**Requer:** `estudantes:manage`

Soft delete: seta `deletadoEm` e `ativo = false`.

---

## Erros e Mensagens

| Situação | Status | Mensagem |
|---|---|---|
| `registro` não numérico | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| `semestre` inválido | 400 | "Semestre deve ser 1 ou 2." |
| Turma não encontrada | 400 | "Turma não encontrada." |
| Curso diferente do atual | 422 | "Este estudante já está enturmado no curso '&lt;curso&gt;'. Não é possível enturmar em cursos diferentes." |
| Limite de 2 matrículas ativas | 422 | "Este estudante já possui 2 enturmações ativas no curso '&lt;curso&gt;' (limite máximo)." |
| Mesmo turno no mesmo curso | 422 | "Este estudante já está enturmado na turma '&lt;sigla&gt;' neste turno. Só é permitido em turnos diferentes." |
| Conflito DB (23505 / uq_matricula_usuario_turma) | 409 | "Este estudante já está matriculado nesta turma." |
| Matrícula duplicada (23505 genérico) | 409 | "Este estudante já está enturmado nesta turma neste período." |
| Módulo menor — mais de 3 disciplinas por turno | 422 | "Módulo menor: máximo 3 disciplinas por turno." |
| Módulo maior — seleção parcial | 422 | "Módulo maior: selecione uma ou todas as disciplinas do turno." |
| FK inválida (23503) | 400 | "Turma ou estudante inválidos. Atualize a página e tente novamente." |
| Schema desatualizado (42703) | 500 | "Erro de schema no banco de dados. Execute as migrações pendentes." |
| Erro interno | 500 | "Erro interno ao salvar a enturmação. Tente novamente." |

---

## Frontend (`/enturmacao`)

### Layout geral

- Rota: `/enturmacao` — visível no menu para `estudantes:manage`
- Lista **todos os estudantes** (role `estudante` ou com matrícula ativa), incluindo os ainda não enturmados
- Campo de busca por nome (filtro local, client-side)
- Cada estudante é um `EstudanteCard` (accordion)

### EstudanteCard

Ao expandir o card:

1. **Cabeçalho**: nome do estudante + data de cadastro
2. **Tabela de enturmações**: colunas Curso | Turno | Turma | Registro | Semestre | Ações (lápis + lixeira)
   - Lápis → abre `EnturmarForm` preenchido para edição da matrícula selecionada
   - Lixeira → abre AlertDialog de confirmação de remoção
3. **EnturmarForm** (nova enturmação ou edição inline)
4. Botão "Nova enturmação" → exibe formulário vazio

### EnturmarForm (cascading)

```
Curso (select) → Turma (select filtrado por curso) → Turno (auto-preenche se único)
→ DisciplinasSeletor (filtrado por cursoId + turnoId)
→ Registro | Ano | Semestre
→ [Salvar] [Cancelar]
```

- Se a turma selecionada tem apenas 1 turno, `turnoId` é preenchido automaticamente
- Ao trocar `turnoId`, a seleção de disciplinas é resetada
- **Novo:** `POST /api/matriculas` + `PUT /api/usuario-disciplinas/:usuarioId`
- **Edição:** `PATCH /api/matriculas/:id` + `PUT /api/usuario-disciplinas/:usuarioId`

### DisciplinasSeletor

| Tipo de curso | Comportamento |
|---|---|
| **Módulo menor** | Checkboxes individuais; contador `{sel}/3`; ao atingir 3, demais ficam desabilitados |
| **Módulo maior** | Botões "Todas (N)" ou "Selecionar uma"; ao escolher "Selecionar uma", exibe radio buttons |

### AlertDialog de exclusão (3 botões)

| Botão | Ação |
|---|---|
| Cancelar | Fecha o dialog **e** colapsa o card do estudante |
| Não | Fecha o dialog (sem colapsar) |
| Sim | Executa `DELETE /api/matriculas/:id` e fecha o dialog |

### Cópia de senha provisória (`NovoUsuarioDialog`)

```typescript
navigator.clipboard.writeText(senhaGerada)
  .then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 2000); })
  .catch(() => {}); // silencioso
```

### Cópia de senha provisória (`NovoUsuarioDialog`)

A cópia usa `navigator.clipboard.writeText()` com `.catch()` silencioso — evita "Uncaught (in promise)" quando a API de clipboard é bloqueada por extensão do browser, perda de foco ou contexto inseguro.

```typescript
navigator.clipboard.writeText(senhaGerada).then(() => {
  setCopiado(true);
  setTimeout(() => setCopiado(false), 2000);
}).catch(() => {});
```

---

## Menu (layout.tsx)

```
Grupo: "Enturmação"  (visível para estudantes:manage)
└── Item: "Estudantes" → /enturmacao
```

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Tabela + `insertMatriculaSchema` |
| `artifacts/api-server/src/routes/matriculas.ts` | GET, POST, DELETE + validações |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion por estudante |
| `artifacts/seshat/src/components/layout.tsx` | Grupo "Enturmação" / item "Estudantes" |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
| `scripts/migrate-matriculas.sql` | DDL da tabela matriculas |
