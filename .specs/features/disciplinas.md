# Spec: Disciplinas

**Agente responsável:** Hermes + Hefesto
**Status:** Implementado ✅

## Modelo de Dados

Uma disciplina pode ser ofertada em múltiplos cursos e turnos via tabela `disciplina_ofertas`.
Professores são vinculados a disciplinas por meio de `usuario_disciplinas` (via `disciplina_oferta_id`).

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
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |

### Tabela `disciplina_ofertas`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `disciplinaId` | uuid FK | → disciplinas (cascade delete) |
| `cursoId` | uuid FK | → cursos (cascade delete) |
| `turnoId` | uuid FK | → turnos (cascade delete) |
| `ativo` | boolean | default true |
| unique | — | (disciplinaId, cursoId, turnoId) |

## Permissão

`disciplinas:manage` — atribuída ao role `administrador` via seed.

> Se o item "Disciplinas" não aparecer no menu, execute:
> `docker compose run --rm dev db:seed`
> Isso sincroniza todas as permissões ao role administrador.

## Endpoints

### GET /api/disciplinas
**Requer:** `disciplinas:manage`

Retorna disciplinas ordenadas por nome, com array `ofertas` de cada uma.

```typescript
Array<{
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
  ofertas: Array<{
    id: string;
    disciplinaId: string;
    cursoId: string;
    cursoNome: string | null;
    turnoId: string;
    turnoNome: string | null;
  }>;
}>
```

### GET /api/disciplinas/:id
**Requer:** `disciplinas:manage`

Retorna a disciplina com `ofertas`.

### POST /api/disciplinas
**Requer:** `disciplinas:manage`

```typescript
{ nome: string }
```

Cria a disciplina. Retorna `{ ...disciplina, ofertas: [] }`.

### PUT /api/disciplinas/:id
**Requer:** `disciplinas:manage`

```typescript
{ nome: string }
```

Atualiza o nome. Retorna `{ ...disciplina, ofertas }`.

### PUT /api/disciplinas/:id/ofertas
**Requer:** `disciplinas:manage`

```typescript
{ ofertas: Array<{ cursoId: string; turnoId: string }> }
```

**Substitui** todas as ofertas da disciplina: remove tudo de `disciplina_ofertas` e reinsere.
Array vazio remove todos os vínculos.

Retorna `{ ok: true, total: number, ofertas: [...] }`.

### DELETE /api/disciplinas/:id
**Requer:** `disciplinas:manage`

Hard delete. `disciplina_ofertas` removidas em cascade.

## Erros e Mensagens

| Situação | Status | Mensagem ao usuário |
|---|---|---|
| `nome` ausente (Zod) | 400 | "Informe o nome da disciplina." |
| Nome duplicado (23505) | 409 | "Já existe uma disciplina com este nome." |
| Curso/turno inexistente (23503) | 400 | "Curso ou turno referenciado não existe. Atualize a página e tente novamente." |
| Erro interno | 500 | "Erro interno ao salvar a disciplina. Tente novamente." |

## Regras de Negócio

- Nome único globalmente (constraint UNIQUE em `disciplinas.nome`)
- Ofertas são substituídas completamente no PUT `/ofertas` — não há acumulação
- Excluir uma disciplina remove todas as suas ofertas em cascade
- Excluir curso ou turno também remove as ofertas relacionadas (cascade)
- Professores vinculados via `usuario_disciplinas` são desvinculados em cascade quando a oferta é excluída

## Casos de Teste

- GET retorna `ofertas: []` para disciplinas sem vínculo
- POST com nome já existente → 409 com mensagem amigável
- PUT `/ofertas` com array vazio → remove todos os vínculos
- PUT `/ofertas` substitui completamente (não acumula)
- DELETE remove disciplina e suas ofertas em cascade
