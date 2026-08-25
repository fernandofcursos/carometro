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
| 1 | **Um curso por estudante**: o estudante só pode estar enturmado em **um único curso**. Não é possível ter enturmações em cursos diferentes ao mesmo tempo. |
| 2 | **Proibido dois cursos simultâneos**: tentativa de enturmar em turma de curso diferente do atual resulta em erro 422. |
| 3 | **Disciplinas do semestre atual**: o estudante pode cursar **uma ou mais disciplinas** do seu semestre atual dentro do seu curso de enturmação (sem restrição adicional). |
| 4 | **Disciplina de semestre anterior**: o estudante pode cursar **uma única disciplina** de semestre anterior ao seu atual, desde que seja no **turno contrário** ao da sua enturmação principal. Esta regra é validada na camada de `usuario_disciplinas`. |
| 5 | **Registro numérico**: o registro do estudante é um número fornecido externamente (não calculado pelo sistema), obrigatório na enturmação, máximo 20 dígitos. |

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
| UNIQUE | — | (usuarioId, turmaId, ano, semestre) |

### Relação com disciplinas

Disciplinas cursadas pelo estudante (disciplinas do semestre atual e eventual disciplina de semestre anterior) são geridas via `usuario_disciplinas` → `disciplina_ofertas`. A validação da regra do semestre anterior e turno contrário é feita na camada de API de `usuario_disciplinas`.

---

## Endpoints

### GET /api/matriculas
**Requer:** `estudantes:manage`

Retorna todos os usuários com role `estudante` e suas matrículas ativas.

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
| Estudante já em outro curso | 422 | "Este estudante já está enturmado em '&lt;nome&gt;'. Um estudante só pode estar enturmado em um curso." |
| Matrícula no mesmo semestre (23505 / uq_matricula_semestre) | 409 | "Este estudante já está enturmado em outro curso neste semestre." |
| Matrícula duplicada (23505) | 409 | "Este estudante já está enturmado nesta turma neste semestre." |
| FK inválida (23503) | 400 | "Turma ou estudante inválidos. Atualize a página e tente novamente." |
| Schema desatualizado (42703) | 500 | "Erro de schema no banco de dados. Execute as migrações pendentes." |
| Erro interno | 500 | "Erro interno ao salvar a enturmação. Tente novamente." |

---

## Frontend (`/enturmacao`)

- Rota: `/enturmacao` — visível no menu para `estudantes:manage`
- Lista todos os usuários com **matrícula ativa** (não filtra por role — evita estudantes "fantasmas")
- Cada card é expansível (accordion): matrículas ativas + formulário de nova enturmação
- Campo `registro` aceita somente dígitos (replace `/\D/g`)
- Remoção via AlertDialog → `DELETE /api/matriculas/:id`

### Cópia de senha provisória (`NovoUsuarioDialog`)

Ao criar um usuário durante enturmação, é exibido um dialog com a senha provisória e botão de copiar.  
A cópia usa `navigator.clipboard.writeText()` com `.catch()` silencioso — evita "Uncaught (in promise)" quando a API de clipboard é bloqueada por extensão do browser, perda de foco ou contexto inseguro.

```typescript
navigator.clipboard.writeText(senhaGerada).then(() => {
  setCopiado(true);
  setTimeout(() => setCopiado(false), 2000);
}).catch(() => {
  // clipboard bloqueado — ignora silenciosamente
});
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
