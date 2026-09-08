# Spec: Portal do Professor

**Status:** Implementado ✅

## Conceito

Portal de autoatendimento para professores. Exibe o quadro de horários das disciplinas que o professor leciona, permite registrar e gerenciar ocorrências de estudantes, criar avisos/informes e ver o perfil com as disciplinas vinculadas.

## Acesso

- **Rota frontend:** `/portal-professor`
- **API base:** `/api/portal-professor`
- **Permissão:** somente `requireAuth` — sem permissão adicional
- **Menu:** visível para usuários com role `professor` (e admins para testes)

## Relação Professor ↔ Disciplinas

```
usuarios (professor)
  └─< usuario_disciplinas
         └── disciplina_oferta_id → disciplina_ofertas
                  ├── disciplina_id → disciplinas (nome, sigla)
                  ├── curso_id     → cursos
                  └── turno_id     → turnos
```

## Endpoints

### GET /api/portal-professor/me

Dados do professor logado:

```typescript
{
  id, nome, fotoUrl,
  disciplinas: Array<{
    ofertaId, disciplinaId, disciplinaNome, disciplinaSigla,
    cursoId, cursoNome, turnoId, turnoNome,
    turmaId, turmaSigla
  }>
}
```

### GET /api/portal-professor/dashboard

```typescript
{
  hoje: "YYYY-MM-DD"; diaSemana: number;
  horariosDisponiveis: boolean;
  horariosPorCurso: Array<{
    cursoId, cursoNome, turnoId, turnoNome,
    agenda: Array<{ dia: 1-5; diaNome; aulas: AulaSlot[] }>
  }>;
  cardapioDisponivel: boolean;
  cardapio: Array<{ dia, diaNome, data, itens: { refeicao, descricao }[] }>;
  avisos: Array<{ id, titulo, conteudo, tipo, publicoAlvo, turmaSigla, criadoEm }>;
}
```

### GET /api/portal-professor/ocorrencias

Lista ocorrências registradas pelo professor (`registradoPorId = usuarioId`), não excluídas.

### POST /api/portal-professor/ocorrencias

```typescript
{ estudanteId, tipoOcorrenciaId, disciplinaId?, turnoId?, dataOcorrencia, observacao? }
```

Seta `registradoPorId = usuarioId` automaticamente.

### PUT /api/portal-professor/ocorrencias/:id

Retorna 403 se `registradoPorId ≠ usuarioId`.

### DELETE /api/portal-professor/ocorrencias/:id

Soft-delete (`deletadoEm = now()`). Retorna 403 se não for o autor.

### GET /api/portal-professor/avisos

Lista avisos do professor (não excluídos).

### POST /api/portal-professor/avisos

```typescript
{
  titulo: string;             // max 200 chars
  conteudo: string;
  tipo: "aviso" | "informe";
  publicoAlvo: "estudantes" | "responsaveis" | "todos";
  turmaId?: string | null;
  publicado?: boolean;        // default false = rascunho
}
```

### PUT /api/portal-professor/avisos/:id

Retorna 403 se `autorId ≠ usuarioId`.

### DELETE /api/portal-professor/avisos/:id

Soft-delete. Retorna 403 se não for o autor.

## Schema: `avisos`

| Campo | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK |
| `titulo` | varchar(200) | NOT NULL |
| `conteudo` | text | NOT NULL |
| `tipo` | varchar(20) | 'aviso' \| 'informe' |
| `publicoAlvo` | varchar(30) | 'estudantes' \| 'responsaveis' \| 'todos' |
| `turmaId` | uuid FK | → turmas, nullable |
| `autorId` | uuid FK | → usuarios |
| `publicado` | boolean | default false |
| `criadoEm` | timestamptz | default now() |
| `atualizadoEm` | timestamptz | default now() |
| `deletadoEm` | timestamptz | nullable — soft-delete |

## Frontend

4 tabs na página `/portal-professor`:

1. **Dashboard** — quadro de horários por curso/turno (grade Seg-Sex), avisos recentes e cardápio da semana
2. **Ocorrências** — lista de ocorrências registradas + formulário criar/editar/excluir
3. **Avisos** — lista de avisos/informes + formulário criar/editar (tipo, público-alvo, publicado)
4. **Perfil** — dados do professor + disciplinas agrupadas por curso

### Quadro de Horários — Apresentação

- Mobile: lista vertical por dia (só dias com aulas)
- Desktop: grade 5 colunas (Seg–Sex)
- Dia atual destacado com `border-primary/50 bg-primary/5`
- Células exibem sigla (`font-mono font-bold text-primary`) + horário + sala

## Migração SQL

```
scripts/migrate-portal-professor.sql
```

Cria tabela `avisos` usando o padrão `add_constraint_if_not_exists`.

Executar: `docker compose run --rm dev psql "$DATABASE_URL" -f scripts/migrate-portal-professor.sql`

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/avisos.ts` | Schema da tabela avisos |
| `lib/db/src/schema/index.ts` | Exporta avisos |
| `artifacts/api-server/src/routes/portal-professor.ts` | Todos os endpoints |
| `artifacts/api-server/src/index.ts` | Registra `/api/portal-professor` |
| `artifacts/seshat/src/pages/portal-professor/index.tsx` | UI: 4 tabs |
| `artifacts/seshat/src/App.tsx` | Rota `/portal-professor` |
| `artifacts/seshat/src/components/layout.tsx` | Menu "Portal do Professor" |
| `scripts/migrate-portal-professor.sql` | DDL: CREATE TABLE avisos |
| `.claude/skills/seshat-portal-professor/SKILL.md` | Skill reference |
