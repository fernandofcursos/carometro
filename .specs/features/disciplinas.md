# Spec: Unidades Curriculares (Disciplinas)

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

> **Nomenclatura:** O conceito de "Disciplina" foi renomeado para **"Unidade Curricular"** em toda a interface. A tabela de banco e as rotas API mantêm o nome `disciplinas` por compatibilidade.

## Modelo de Dados

Uma unidade curricular pode ser ofertada em múltiplos cursos e turnos via tabela `disciplina_ofertas`.
Professores são vinculados via `usuario_disciplinas` (por `disciplina_oferta_id`).

```
disciplinas (1) ──< disciplina_ofertas >── cursos (1)
                                       └── turnos (1)
disciplina_ofertas (1) ──< usuario_disciplinas >── usuarios (professores)
```

### Tabela `disciplinas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `nome` | text | NOT NULL, UNIQUE |
| `sigla` | varchar(20) | NOT NULL, UNIQUE — exibida no quadro de horários |
| `codigoModulacao` | varchar(50) | NOT NULL — código interno de modulação |
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |

**Observações:**
- `sigla` é o que aparece nas células do quadro de horários (mais compacto); o nome completo é exibido em tooltip ao posicionar o cursor.
- `codigoModulacao` é obrigatório mas não tem constraint UNIQUE (mesmo código pode aparecer em contextos diferentes).

### Tabela `disciplina_ofertas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `disciplinaId` | uuid FK | → disciplinas (cascade delete) |
| `cursoId` | uuid FK | → cursos (cascade delete) |
| `turnoId` | uuid FK | → turnos (cascade delete) |
| `ativo` | boolean | default true |
| unique | — | (disciplinaId, cursoId, turnoId) |

## Migração

```sql
-- scripts/migrate-disciplinas-sigla-codigo.sql
ALTER TABLE disciplinas
  ADD COLUMN IF NOT EXISTS sigla           varchar(20),
  ADD COLUMN IF NOT EXISTS codigo_modulacao varchar(50);

-- Preenche valores temporários para registros existentes
UPDATE disciplinas SET
  sigla           = COALESCE(sigla,           upper(substring(nome, 1, 6))),
  codigo_modulacao = COALESCE(codigo_modulacao, upper(substring(nome, 1, 10)))
WHERE sigla IS NULL OR codigo_modulacao IS NULL;

ALTER TABLE disciplinas
  ALTER COLUMN sigla           SET NOT NULL,
  ALTER COLUMN codigo_modulacao SET NOT NULL;

ALTER TABLE disciplinas ADD CONSTRAINT IF NOT EXISTS disciplinas_sigla_unique UNIQUE (sigla);
CREATE INDEX IF NOT EXISTS idx_disciplinas_sigla ON disciplinas (sigla);
```

## Permissão

`disciplinas:manage` — atribuída ao role `administrador` via seed.

> Se o item "Unid. Curriculares" não aparecer no menu, execute:
> `docker compose run --rm dev db:seed`

## Endpoints

### GET /api/disciplinas
**Requer:** `disciplinas:manage`

Retorna unidades curriculares ordenadas por nome, com array `ofertas`.

```typescript
Array<{
  id: string;
  nome: string;
  sigla: string;
  codigoModulacao: string;
  criadoEm: string;
  atualizadoEm: string;
  ofertas: Array<{
    id: string; disciplinaId: string;
    cursoId: string; cursoNome: string | null;
    turnoId: string; turnoNome: string | null;
  }>;
}>
```

### POST /api/disciplinas
**Requer:** `disciplinas:manage`

```typescript
{ nome: string; sigla: string; codigoModulacao: string }
```

Cria a unidade curricular. Retorna `{ ...disciplina, ofertas: [] }`.

### PUT /api/disciplinas/:id
**Requer:** `disciplinas:manage`

```typescript
{ nome: string; sigla: string; codigoModulacao: string }
```

Atualiza. Retorna `{ ...disciplina, ofertas }`.

### PUT /api/disciplinas/:id/ofertas
**Requer:** `disciplinas:manage`

```typescript
{ ofertas: Array<{ cursoId: string; turnoId: string }> }
```

**Substitui** todas as ofertas. Array vazio remove todos os vínculos.
Retorna `{ ok: true, total: number, ofertas: [...] }`.

### DELETE /api/disciplinas/:id
**Requer:** `disciplinas:manage`

Hard delete. `disciplina_ofertas` removidas em cascade.

## Erros e Mensagens

| Situação | Status | Mensagem ao usuário |
|---|---|---|
| `nome` ausente (Zod) | 400 | "Informe o nome da unidade curricular." |
| `sigla` inválida (Zod) | 400 | "Informe a sigla." / "Sigla deve ter no máximo 20 caracteres." |
| `codigoModulacao` ausente (Zod) | 400 | "Informe o código de modulação." |
| Sigla duplicada (23505 + disciplinas_sigla) | 409 | "Já existe uma unidade curricular com esta sigla." |
| Nome duplicado (23505) | 409 | "Já existe uma unidade curricular com este nome." |
| Curso/turno inexistente (23503) | 400 | "Curso ou turno referenciado não existe. Atualize a página e tente novamente." |
| Erro interno | 500 | "Erro interno ao salvar a unidade curricular. Tente novamente." |

## Quadro de Horários — Apresentação

O campo `disciplinaNome` **nunca** aparece diretamente nas células do quadro de horários.  
Em seu lugar, usa-se `disciplinaSigla` (mais compacto). O nome completo é exibido via tooltip `<Tooltip>` (shadcn/ui) ao posicionar o cursor sobre a célula.

APIs que retornam `AulaItem` (`GET /api/portal/dashboard` e `GET /api/portal-responsavel/dashboard`) incluem ambos:
```typescript
AulaItem = {
  horaInicio: string; horaFim: string;
  disciplinaNome: string;   // nome completo — exibido no tooltip
  disciplinaSigla: string;  // sigla — exibida na célula
  sala: string | null;
}
```

## Regras de Negócio

- `sigla` única globalmente (constraint UNIQUE em `disciplinas.sigla`)
- `nome` único globalmente (constraint UNIQUE em `disciplinas.nome`)
- `codigoModulacao` obrigatório, não UNIQUE
- Ofertas são substituídas completamente no PUT `/ofertas` — não acumula
- Excluir disciplina remove todas as ofertas em cascade
- Excluir curso ou turno também remove as ofertas relacionadas (cascade)

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/disciplinas.ts` | Tabela + `insertDisciplinaSchema` (sigla, codigoModulacao) |
| `lib/db/src/schema/disciplina-ofertas.ts` | Tabela de ofertas (N:N) |
| `artifacts/api-server/src/routes/disciplinas.ts` | CRUD + ofertas + `disciplinaErrorMessage()` |
| `artifacts/seshat/src/pages/disciplinas/index.tsx` | UI com formulário multi-campo + `EditarDiscDialog` + `OfertasModal` |
| `artifacts/seshat/src/pages/dashboard.tsx` | `QuadroHorariosWidget` exibe sigla + tooltip nome completo |
| `scripts/migrate-disciplinas-sigla-codigo.sql` | DDL: ADD COLUMN sigla + codigo_modulacao |
| `.specs/features/disciplinas.md` | Esta spec |
