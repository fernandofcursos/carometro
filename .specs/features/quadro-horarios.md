# Spec: Quadro de Horários

**Status:** Implementado

---

## Objetivo

Gerenciar o quadro semanal de aulas de cada turma: dia da semana, horário de início/fim, disciplina, sala e professor responsável. Serve de base para a agenda de aulas exibida no dashboard do estudante e responsável.

---

## Regras de Negócio

- Cada entrada do quadro vincula uma `turma` a uma `disciplina_oferta` em um dia e horário fixo semanal
- Um mesmo slot (turma + dia + horário) não pode ter duas disciplinas diferentes
- O quadro pode variar por semestre (campo `ano` + `semestre`)
- Estudante vê apenas os horários das turmas em que está matriculado
- Sala é opcional — pode ser preenchida depois

### Dias da semana

| Código | Nome |
|---|---|
| 1 | Segunda-feira |
| 2 | Terça-feira |
| 3 | Quarta-feira |
| 4 | Quinta-feira |
| 5 | Sexta-feira |

Sábado e domingo não são suportados (alerta se tentado).

---

## Banco de Dados

### Tabela `horarios_aulas`

```sql
CREATE TABLE horarios_aulas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id        uuid NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  disciplina_oferta_id uuid REFERENCES disciplina_ofertas(id) ON DELETE SET NULL,
  dia_semana      smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 5),
  hora_inicio     time NOT NULL,
  hora_fim        time NOT NULL,
  sala            varchar(50),
  ano             integer NOT NULL,
  semestre        smallint NOT NULL CHECK (semestre IN (1, 2)),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_horario_valido CHECK (hora_fim > hora_inicio),
  CONSTRAINT uq_slot_turma UNIQUE (turma_id, dia_semana, hora_inicio, ano, semestre)
);
CREATE INDEX idx_horarios_turma ON horarios_aulas (turma_id, ano, semestre);
```

---

## Endpoints

### `GET /api/horarios?turmaId=&ano=&semestre=`
Retorna o quadro semanal de uma turma.

```typescript
// response
{
  turmaId: string;
  ano: number;
  semestre: 1 | 2;
  slots: Array<{
    id: string;
    diaSemana: number;       // 1–5
    horaInicio: string;      // "HH:MM"
    horaFim: string;
    disciplinaNome: string | null;
    professorNome: string | null;
    sala: string | null;
  }>;
}
```

### `POST /api/horarios` — criar slot
```typescript
{
  turmaId: string;
  disciplinaOfertaId: string;
  diaSemana: 1 | 2 | 3 | 4 | 5;
  horaInicio: string;   // "HH:MM"
  horaFim: string;
  sala?: string;
  ano: number;
  semestre: 1 | 2;
}
```

### `PUT /api/horarios/:id` — editar slot
### `DELETE /api/horarios/:id` — remover slot

---

## Design

### Página `/horarios`

```
┌────────────────────────────────────────────────────────┐
│  Quadro de Horários                                    │
│  Turma: [EJA 1º Seg ▼]  Ano: [2026]  Semestre: [2 ▼] │
├──────────┬──────────┬──────────┬──────────┬───────────┤
│ Segunda  │ Terça    │ Quarta   │ Quinta   │ Sexta     │
├──────────┼──────────┼──────────┼──────────┼───────────┤
│ 07:00    │          │          │          │           │
│ Matemát. │          │          │          │           │
│ Sala 12  │          │          │          │           │
├──────────┼──────────┼──────────┼──────────┼───────────┤
│ …        │ …        │ …        │ …        │ …         │
└──────────┴──────────┴──────────┴──────────┴───────────┘
[+ Adicionar slot]
```

- Clique em slot existente → modal de edição
- Clique em célula vazia → modal de criação pré-preenchida com dia/hora

---

## Acesso e Permissões

| Operação | Permissão |
|---|---|
| Visualizar quadro (gestão) | `horarios:manage` |
| Criar/editar/excluir slots | `horarios:manage` |
| Visualizar (estudante/responsável) | via `/api/portal/dashboard` — somente leitura |

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---|---|
| `lib/db/src/schema/horarios.ts` | Schema `horarios_aulas` |
| `artifacts/api-server/src/routes/horarios.ts` | CRUD de slots |
| `artifacts/seshat/src/pages/horarios/index.tsx` | UI do quadro semanal |
| `scripts/migrate-dashboard.sql` | DDL da tabela (já inclui `horarios_aulas`) |
| `.specs/features/quadro-horarios.md` | Esta spec |
