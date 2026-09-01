# Skill: Unidades Curriculares (Disciplinas)

> **Nomenclatura:** "Disciplina" foi renomeado para **"Unidade Curricular"** na interface. Tabela e rotas API mantêm o nome `disciplinas`.

## Modelo

```
disciplinas (1) ──< disciplina_ofertas >── cursos (1)
                                       └── turnos (1)
disciplina_ofertas (1) ──< usuario_disciplinas >── usuarios (professores)
```

### Schema

```typescript
// lib/db/src/schema/disciplinas.ts
disciplinasTable: {
  id, nome (text, NOT NULL, UNIQUE),
  sigla (varchar 20, NOT NULL, UNIQUE),          // ← NOVO — exibida no quadro de horários
  codigoModulacao (varchar 50, NOT NULL),        // ← NOVO — código de modulação
  criadoEm, atualizadoEm
}

// lib/db/src/schema/disciplina-ofertas.ts
disciplinaOfertasTable: {
  id, disciplinaId (FK → disciplinas, cascade delete),
  cursoId (FK → cursos, cascade delete),
  turnoId (FK → turnos, cascade delete),
  ativo (boolean, default true)
  UNIQUE (disciplinaId, cursoId, turnoId)
}
```

## Permissão: `disciplinas:manage`

Atribuída ao role `administrador` via `seedPermissoes`.

**Menu não aparece?** Executar `docker compose run --rm dev db:seed` para sincronizar.

## GET /api/disciplinas — estrutura de resposta

```typescript
Array<{
  id, nome, sigla, codigoModulacao, criadoEm, atualizadoEm,
  ofertas: Array<{ id, disciplinaId, cursoId, cursoNome, turnoId, turnoNome }>
}>
```

## POST / PUT /api/disciplinas — body

```typescript
{ nome: string; sigla: string; codigoModulacao: string }
```

Todos os três campos são **obrigatórios**.

## PUT /api/disciplinas/:id/ofertas

```typescript
{ ofertas: [{ cursoId, turnoId }] }
```

Substitui completamente. Array vazio remove todos os vínculos.

## Tratamento de Erros (`disciplinaErrorMessage`)

| Erro | Mensagem |
|---|---|
| Zod `nome` | "Informe o nome da unidade curricular." |
| Zod `sigla` | "Informe a sigla." / "Sigla deve ter no máximo 20 caracteres." |
| Zod `codigoModulacao` | "Informe o código de modulação." |
| 23505 + disciplinas_sigla | "Já existe uma unidade curricular com esta sigla." |
| 23505 / `disciplinas_nome` | "Já existe uma unidade curricular com este nome." |
| 23503 | "Curso ou turno referenciado não existe. Atualize a página e tente novamente." |
| Outros | "Erro interno ao salvar a unidade curricular. Tente novamente." |

## Frontend (`artifacts/seshat/src/pages/disciplinas/index.tsx`)

- `DiscRow` — linha com nome, badge de sigla e código; abre `EditarDiscDialog` ou `OfertasModal`
- `EditarDiscDialog` — dialog com 3 campos: nome, sigla, codigoModulacao
- `OfertasModal` — matriz cursos × turnos com checkboxes; chama `PUT /api/disciplinas/:id/ofertas`
- Formulário de criação tem todos os 3 campos obrigatórios
- Sigla é sempre convertida para maiúsculas no input

## Quadro de Horários — Regra de Apresentação

**NUNCA** exibir `disciplinaNome` diretamente nas células do quadro de horários.

- Células: exibem `disciplinaSigla` (compact, font-mono)
- Tooltip (`<Tooltip>` shadcn/ui): exibe `disciplinaNome` completo ao hover

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <div ...>{aula.disciplinaSigla ?? aula.disciplinaNome}</div>
  </TooltipTrigger>
  <TooltipContent>
    <p className="font-semibold">{aula.disciplinaNome}</p>
    {aula.sala && <p className="opacity-70">Sala: {aula.sala}</p>}
  </TooltipContent>
</Tooltip>
```

## AulaItem — shape completo

```typescript
type AulaItem = {
  horaInicio: string; horaFim: string;
  disciplinaNome: string;   // nome completo — tooltip
  disciplinaSigla: string;  // sigla — exibida na célula
  sala: string | null;
};
```

Ambos os campos são retornados por `GET /api/portal/dashboard` e `GET /api/portal-responsavel/dashboard`.

## Migração SQL

```sql
-- scripts/migrate-disciplinas-sigla-codigo.sql
ALTER TABLE disciplinas
  ADD COLUMN IF NOT EXISTS sigla           varchar(20),
  ADD COLUMN IF NOT EXISTS codigo_modulacao varchar(50);

UPDATE disciplinas SET
  sigla           = upper(substring(nome, 1, 6)),
  codigo_modulacao = upper(substring(nome, 1, 10))
WHERE sigla IS NULL;

ALTER TABLE disciplinas
  ALTER COLUMN sigla SET NOT NULL,
  ALTER COLUMN codigo_modulacao SET NOT NULL;

ALTER TABLE disciplinas ADD CONSTRAINT IF NOT EXISTS disciplinas_sigla_unique UNIQUE (sigla);
```

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/disciplinas.ts` | Tabela + `insertDisciplinaSchema` |
| `lib/db/src/schema/disciplina-ofertas.ts` | Tabela de ofertas (N:N disciplina × curso × turno) |
| `artifacts/api-server/src/routes/disciplinas.ts` | CRUD + ofertas + `disciplinaErrorMessage()` |
| `artifacts/seshat/src/pages/disciplinas/index.tsx` | UI: formulário multi-campo + EditarDiscDialog + OfertasModal |
| `artifacts/seshat/src/pages/dashboard.tsx` | `QuadroHorariosWidget` — sigla + tooltip |
| `scripts/migrate-disciplinas-sigla-codigo.sql` | DDL de migração |
| `.specs/features/disciplinas.md` | Spec completa |
