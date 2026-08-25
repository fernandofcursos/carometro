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
| 1 | **Uma única matrícula ativa**: o estudante só pode estar enturmado em **um único curso**, em **um único turno**. Não é possível ter duas matrículas ativas simultaneamente, mesmo em cursos ou turnos diferentes. |
| 2 | **Proibido dois cursos mesmo em turnos diferentes**: tentativa de enturmar um estudante que já possui matrícula ativa resulta em erro 422. O admin deve remover a enturmação atual antes de enturmar em outro curso. |
| 3 | **Disciplinas**: o estudante pode cursar **uma ou todas as disciplinas** do curso ao qual está enturmado. A seleção é feita na página de enturmação, agrupada por Curso e Turno. |
| 4 | **Opção padrão de disciplinas**: ao enturmar, a seleção padrão é **"Todas as disciplinas"** do curso. O admin pode restringir para disciplinas específicas. |
| 5 | **Registro numérico**: o registro do estudante é um número fornecido externamente (não calculado pelo sistema), obrigatório na enturmação, máximo 20 dígitos. |
| 6 | **Visibilidade**: a página mostra **todos os estudantes** — com ou sem enturmação ativa. Estudantes sem matrícula aparecem na lista com o formulário de enturmação disponível. |

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
| UNIQUE parcial | — | (usuarioId, ano, semestre) WHERE deletadoEm IS NULL — só linhas ativas participam da unicidade |

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
  }>;
  disciplinas: Array<{      // disciplinas cursadas pelo estudante
    disciplinaOfertaId: string;
    disciplinaNome: string;
    cursoNome: string;
    turnoNome: string;
  }>;
}>
```

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
| Estudante com matrícula ativa | 422 | "Este estudante já está enturmado em '&lt;curso&gt; — &lt;turma&gt;' (&lt;ano&gt;/&lt;sem&gt;º sem.). Remova a enturmação atual antes de enturmar em outro curso." |
| Conflito DB parcial (23505 / uq_matricula_ativo) | 409 | "Este estudante já possui uma matrícula ativa. Remova a enturmação atual antes de enturmar em outro curso." |
| Matrícula duplicada (23505 genérico) | 409 | "Este estudante já está enturmado nesta turma neste período." |
| FK inválida (23503) | 400 | "Turma ou estudante inválidos. Atualize a página e tente novamente." |
| Schema desatualizado (42703) | 500 | "Erro de schema no banco de dados. Execute as migrações pendentes." |
| Erro interno | 500 | "Erro interno ao salvar a enturmação. Tente novamente." |

---

## Frontend (`/enturmacao`)

- Rota: `/enturmacao` — visível no menu para `estudantes:manage`
- Lista **todos os estudantes** (role `estudante` ou com matrícula ativa), incluindo os ainda não enturmados
- Cada card é expansível (accordion) com três seções: **matrículas ativas**, **disciplinas cursadas** e **formulário de enturmação**
- Campo `registro` aceita somente dígitos (replace `/\D/g`)
- Remoção de matrícula via AlertDialog → `DELETE /api/matriculas/:id`

### Seleção de Disciplinas na Enturmação

Ao expandir o card do estudante, é exibida uma seção de **Disciplinas** com:

| Elemento | Comportamento |
|---|---|
| Agrupamento | Disciplinas agrupadas por **Curso** e depois por **Turno** |
| Opção padrão | **"Todas as disciplinas"** — selecionado por padrão ao enturmar |
| Seleção individual | Checkbox por disciplina dentro de cada grupo Curso/Turno |
| Toggle "Todas" | Ao marcar "Todas as disciplinas", todas as disciplinas do curso são selecionadas; desmarcar volta para seleção individual |
| Persistência | Seleção salva via `POST /api/usuario-disciplinas` (bulk) |

**Estrutura visual de agrupamento:**

```
▸ Técnico em Informática
  ▸ Manhã
    [✓] Todas as disciplinas
    [ ] Programação Web
    [ ] Banco de Dados
  ▸ Tarde
    [ ] Redes de Computadores
▸ Técnico em Administração
  ▸ Noite
    [✓] Todas as disciplinas
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
