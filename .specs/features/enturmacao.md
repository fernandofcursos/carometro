# Spec: Enturmação

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

## Conceito

Enturmação é o processo de vincular um estudante (usuário com role `estudante`) a uma turma em um semestre específico. Cada vínculo é uma **matrícula**.

O menu lateral exibe o grupo **"Enturmação"** (visível para `estudantes:view` ou `estudantes:manage`), com o item **"Enturmação"** apontando para `/enturmacao` (visível somente para `estudantes:manage`).

---

## Regras de Negócio

| Regra | Detalhe |
|---|---|
| **Um curso por período** | Um estudante só pode estar matriculado em **um único curso** por semestre/ano. Tentativa de matricular em segundo curso retorna 422. |
| **Máximo 2 turmas por semestre** | No mesmo curso, um estudante pode ter no máximo 2 matrículas por semestre: 1 **principal** e 1 **complementar** (para complementação de disciplinas). |
| **Registro numérico** | O registro do estudante é um número fornecido externamente (não calculado pelo sistema). Armazenado como string numérica, obrigatório na matrícula, máximo 20 dígitos. |
| **Matrícula por semestre** | Cada matrícula está vinculada a `(usuarioId, turmaId, ano, semestre)` — UNIQUE. |
| **Soft delete** | Matrículas são desativadas (`deletadoEm`, `ativo=false`), nunca apagadas fisicamente. |

---

## Modelo de Dados

```
usuarios (estudante) (1) ──< matriculas >── (1) turmas
                                         ├── registro (varchar 20, numérico)
                                         ├── ano (integer)
                                         ├── semestre (1 ou 2)
                                         └── principal (boolean)
```

### Tabela `matriculas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `usuarioId` | uuid FK | → usuarios (restrict delete) |
| `turmaId` | uuid FK | → turmas (restrict delete) |
| `registro` | varchar(20) | NOT NULL, numérico |
| `ano` | integer | NOT NULL |
| `semestre` | smallint | NOT NULL, CHECK IN (1, 2) |
| `principal` | boolean | true = turno principal, false = complementar |
| `ativo` | boolean | default true |
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |
| `deletadoEm` | timestamptz | soft delete |
| UNIQUE | — | (usuarioId, turmaId, ano, semestre) |

---

## Endpoints

### GET /api/matriculas
**Requer:** `estudantes:manage`

Retorna todos os usuários com role `estudante` e suas matrículas ativas.

```typescript
Array<{
  id: string;          // usuarioId
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
    principal: boolean;
    ativo: boolean;
    criadoEm: string;
  }>;
}>
```

### POST /api/matriculas
**Requer:** `estudantes:manage`

```typescript
{
  usuarioId: string;
  turmaId: string;
  registro: string;    // numérico, máx 20 dígitos
  ano: number;         // 2000–2100
  semestre: 1 | 2;
}
```

**Validações de negócio (app-level):**
1. Busca as matrículas ativas do estudante no mesmo (ano, semestre)
2. Determina o cursoId da turma alvo via JOIN turmas → cursos
3. Se o estudante já tem matrícula em **outro curso** no mesmo período → 422
4. Se o estudante já tem **2 matrículas** no mesmo curso no período → 422
5. `principal` é definido automaticamente: `true` se não há matrícula principal ainda; `false` se já há

### DELETE /api/matriculas/:id
**Requer:** `estudantes:manage`

Soft delete: seta `deletadoEm` e `ativo = false`.

---

## Erros e Mensagens

| Situação | Status | Mensagem |
|---|---|---|
| `registro` inválido (não numérico) | 400 | "Registro inválido — deve ser numérico e ter no máximo 20 dígitos." |
| `semestre` != 1 ou 2 | 400 | "Semestre deve ser 1 ou 2." |
| Turma inválida | 400 | "Turma não encontrada." |
| Segundo curso no mesmo período | 422 | "Este estudante já está matriculado em outro curso neste semestre..." |
| Mais de 2 turmas no mesmo curso/período | 422 | "Limite de 2 turmas por semestre atingido..." |
| UNIQUE violation | 409 | "Este estudante já está matriculado nesta turma neste semestre." |
| Erro interno | 500 | "Erro interno ao salvar a matrícula. Tente novamente." |

---

## Frontend (`/enturmacao`)

- Rota: `/enturmacao` (componente `EnturmacaoPage`)
- Permissão para ver o item no menu: `estudantes:manage`
- Lista todos os usuários com role `estudante`
- Busca por nome (filtro local)
- Cada card é expansível (accordion): mostra matrículas ativas + formulário inline para nova enturmação
- `principal` / `complementar` indicados por badge
- Remoção de matrícula com confirmação via AlertDialog
- Formulário de nova matrícula: Turma, Registro, Ano, Semestre

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/matriculas.ts` | Tabela `matriculas` + `insertMatriculaSchema` |
| `artifacts/api-server/src/routes/matriculas.ts` | CRUD + validações de negócio |
| `artifacts/seshat/src/pages/enturmacao/index.tsx` | UI accordion por estudante |
| `artifacts/seshat/src/components/layout.tsx` | Menu "Enturmação" → `/enturmacao` |
| `artifacts/seshat/src/App.tsx` | Rota `/enturmacao` |
